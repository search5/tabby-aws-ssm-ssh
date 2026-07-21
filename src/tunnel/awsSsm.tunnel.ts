import { Duplex } from 'stream';
import * as WebSocket from 'ws';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface AwsSsmTunnelOptions {
    streamUrl: string;
    tokenValue: string;
}

interface AgentMessage {
    messageType: string;
    sequenceNumber: number;
    flags: number;
    messageId: string;
    payloadType: number;
    payload: Buffer;
}

// AWS session-manager-plugin(message.PayloadType)과 동일한 값.
// https://github.com/aws/session-manager-plugin/blob/main/src/message/clientmessage.go
const PAYLOAD_TYPE = {
    Output: 1,
    Error: 2,
    Size: 3,
    Parameter: 4,
    HandshakeRequest: 5,
    HandshakeResponse: 6,
    HandshakeComplete: 7,
    EncChallengeRequest: 8,
    EncChallengeResponse: 9,
    Flag: 10,
    StdErr: 11,
    ExitCode: 12,
} as const;

export class AwsSsmTunnelStream extends Duplex {
    private ws: WebSocket | null = null;
    private sequenceNumber = BigInt(0);
    private isClosed = false;
    // 하나의 WebSocket 프레임에 AgentMessage가 여러 개 이어붙어 오거나, 하나의 메시지가 여러 프레임에
    // 걸쳐 쪼개져 올 수 있다. 프레임 = 메시지로 가정하고 payloadLength 뒷부분을 버리면 SSH 바이트
    // 스트림 중간이 잘려나가 이후 패킷 복호화가 BAD_DECRYPT로 깨진다. 그래서 길이 기반으로 직접 프레이밍한다.
    private recvBuffer: Buffer = Buffer.alloc(0);

    // AWS-StartSSHSession 등은 에이전트가 대상 포트(예: 22)로 실제 연결을 맺기 전까지 클라이언트가
    // 보낸 input_stream_data를 그냥 버린다 — WebSocket이 열리자마자 SSH 배너/KEXINIT을 써버리면
    // 그 바이트가 통째로 유실되고 이후 sshd는 "invalid identification string"/ssh2는 "Bad packet
    // length"를 던진다(직접 raw 캡처로 재현 확인). HandshakeComplete를 받기 전까지는 실제 쓰기를
    // 큐에 모아뒀다가, 준비 신호(HandshakeComplete 또는 handshake 없이 바로 오는 실제 Output)를
    // 받은 뒤에 순서대로 흘려보낸다.
    private handshakeReady = false;
    private pendingActions: Array<() => void> = [];

    constructor(private options: AwsSsmTunnelOptions) {
        super();
    }

    async connect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.ws = new WebSocket(this.options.streamUrl);
            this.ws.binaryType = 'arraybuffer';

            this.ws.on('open', () => {
                try {
                    // 1. Handshake JSON 전송
                    const handshake = {
                        MessageSchemaVersion: '1.0',
                        RequestId: uuidv4(),
                        TokenValue: this.options.tokenValue,
                    };
                    this.ws!.send(JSON.stringify(handshake));
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });

            this.ws.on('message', (data: ArrayBuffer) => {
                try {
                    this.recvBuffer = Buffer.concat([this.recvBuffer, Buffer.from(data)]);

                    // recvBuffer에 완성된 AgentMessage가 있는 만큼 계속 꺼내 처리한다.
                    // (고정 헤더 120바이트 + payloadLength 만큼이 한 메시지)
                    while (this.recvBuffer.length >= 120) {
                        const payloadLength = this.recvBuffer.readUInt32BE(116);
                        const totalLength = 120 + payloadLength;
                        if (this.recvBuffer.length < totalLength) break; // 메시지가 아직 다 안 옴

                        const message = this.decodeMessage(this.recvBuffer.subarray(0, totalLength));
                        this.recvBuffer = this.recvBuffer.subarray(totalLength);

                        // MessageType이 output_stream_data 인 경우 처리
                        if (message.messageType.trim() === 'output_stream_data') {
                            // ACK은 PayloadType에 상관없이 항상 먼저 보낸다 (AWS 세션 매니저 프로토콜 규약).
                            this.sendAck(message);

                            if (message.payloadType === PAYLOAD_TYPE.HandshakeRequest) {
                                // AWS-StartSSHSession/PortForwarding 문서는 실제 포트로 연결을 열기 전에
                                // 이 handshake 교환을 요구한다. 응답하지 않으면 에이전트가 대상 포트(22)에
                                // 연결하지 않고 그대로 채널을 닫아버려서, ssh2가 "Connection lost before
                                // handshake"를 던지는 것으로 관측된다.
                                this.handleHandshakeRequest(message.payload);
                            } else if (message.payloadType === PAYLOAD_TYPE.Output || message.payloadType === PAYLOAD_TYPE.StdErr) {
                                // handshake 요청을 아예 안 보내는 세션(순수 SSM 셸)도 있다 — 그런 경우
                                // 실제 Output이 왔다는 것 자체가 "handshake 불필요, 써도 됨"이라는 신호다.
                                if (!this.handshakeReady) {
                                    this.handshakeReady = true;
                                    this.flushPendingWrites();
                                }
                                // 실제 터미널/포트 바이트만 SSH 클라이언트(또는 터미널)로 전달한다.
                                this.push(message.payload);
                            } else if (message.payloadType === PAYLOAD_TYPE.HandshakeComplete) {
                                // 이제부터 에이전트가 대상 포트로 실제 전달을 시작한다는 공식 신호.
                                // 그 전에 보낸 바이트는 조용히 버려진다(직접 확인함).
                                this.handshakeReady = true;
                                this.flushPendingWrites();
                            }
                            // Error/Flag/ExitCode 등은 ACK만 하고 별도 처리는 하지 않는다.
                        }
                    }
                } catch (err) {
                    this.destroy(err as Error);
                }
            });

            this.ws.on('error', (err) => {
                this.destroy(err);
            });

            this.ws.on('close', () => {
                this.isClosed = true;
                this.push(null);
            });
        });
    }

    private decodeMessage(buf: Buffer): AgentMessage {
        const headerLength = buf.readUInt32BE(0); // 116
        const messageType = buf.toString('utf8', 4, 36).trim();
        const schemaVersion = buf.readUInt32BE(36);
        const createdDate = Number(buf.readBigInt64BE(40));
        const sequenceNumber = Number(buf.readBigInt64BE(48));
        const flags = Number(buf.readBigInt64BE(56));

        const messageIdBytes = buf.subarray(64, 80);
        const messageId = this.parseUuid(messageIdBytes);

        const payloadDigest = buf.subarray(80, 112);
        const payloadType = buf.readUInt32BE(112);
        const payloadLength = buf.readUInt32BE(116);
        const payload = buf.subarray(120, 120 + payloadLength);

        return {
            messageType,
            sequenceNumber,
            flags,
            messageId,
            payloadType,
            payload,
        };
    }

    private encodeMessage(msg: Omit<AgentMessage, 'messageId'> & { messageId?: string }): Buffer {
        const headerLength = 116;
        const payloadLength = msg.payload.length;
        const buf = Buffer.alloc(120 + payloadLength);

        // HeaderLength
        buf.writeUInt32BE(headerLength, 0);

        // MessageType (32 bytes space-padded)
        buf.write(msg.messageType.padEnd(32, ' '), 4, 32, 'utf8');

        // SchemaVersion
        buf.writeUInt32BE(1, 36);

        // CreatedDate
        buf.writeBigInt64BE(BigInt(Date.now()), 40);

        // SequenceNumber
        buf.writeBigInt64BE(BigInt(msg.sequenceNumber), 48);

        // Flags
        buf.writeBigInt64BE(BigInt(msg.flags), 56);

        // MessageId
        const messageId = msg.messageId || uuidv4();
        const messageIdBytes = this.generateUuidBytes(messageId);
        messageIdBytes.copy(buf, 64);

        // PayloadDigest
        const hash = crypto.createHash('sha256').update(msg.payload).digest();
        hash.copy(buf, 80);

        // PayloadType
        buf.writeUInt32BE(msg.payloadType, 112);

        // PayloadLength
        buf.writeUInt32BE(payloadLength, 116);

        // Payload
        msg.payload.copy(buf, 120);

        return buf;
    }

    // 순수 SSM 세션(SSH 없이 SSM 에이전트가 직접 여는 셸)에서 터미널 리사이즈를 알리는 데 쓴다.
    // SSH 터널 모드에서는 ssh2 ClientChannel.setWindow()를 쓰므로 이건 필요 없다.
    sendSize(cols: number, rows: number) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        if (!this.handshakeReady) {
            this.pendingActions.push(() => this.sendSizeNow(cols, rows));
            return;
        }

        this.sendSizeNow(cols, rows);
    }

    private sendSizeNow(cols: number, rows: number) {
        const payloadBuffer = Buffer.from(JSON.stringify({ cols, rows }));

        const message = this.encodeMessage({
            messageType: 'input_stream_data',
            sequenceNumber: Number(this.sequenceNumber++),
            flags: 0,
            payloadType: 3, // Size
            payload: payloadBuffer,
        });

        this.ws!.send(message);
    }

    private sendAck(receivedMessage: AgentMessage) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const ackPayload = {
            AcknowledgedMessageId: receivedMessage.messageId,
            AcknowledgedMessageType: receivedMessage.messageType,
            AcknowledgedMessageSequenceNumber: receivedMessage.sequenceNumber,
            IsAppurtenantMessage: true,
        };

        const payloadBuffer = Buffer.from(JSON.stringify(ackPayload));

        const ackMessageBuffer = this.encodeMessage({
            messageType: 'acknowledge',
            sequenceNumber: receivedMessage.sequenceNumber,
            flags: 0,
            payloadType: 3, // ACK_TYPE
            payload: payloadBuffer,
        });

        this.ws.send(ackMessageBuffer);
    }

    // 에이전트가 요청한 모든 액션(SessionType 등)을 그냥 성공으로 응답한다 — 어차피 우리는
    // 단순 바이트 파이프 역할만 하고 세션 타입/암호화 종류에 따라 동작을 분기하지 않는다.
    private handleHandshakeRequest(payload: Buffer) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        let requestedActions: Array<{ ActionType: string }> = [];
        try {
            const request = JSON.parse(payload.toString('utf8'));
            requestedActions = request.RequestedClientActions ?? [];
        } catch {
            // 파싱 실패해도 빈 액션 목록으로 응답을 보내 handshake 자체는 이어가게 한다.
        }

        const handshakeResponse = {
            ClientVersion: '1.2.694.0',
            ProcessedClientActions: requestedActions.map(action => ({
                ActionType: action.ActionType,
                ActionStatus: 1, // ActionStatus.Success
                ActionResult: {},
                Error: '',
            })),
            Errors: [] as string[],
        };

        const payloadBuffer = Buffer.from(JSON.stringify(handshakeResponse));

        const message = this.encodeMessage({
            messageType: 'input_stream_data',
            sequenceNumber: Number(this.sequenceNumber++),
            flags: 0,
            payloadType: PAYLOAD_TYPE.HandshakeResponse,
            payload: payloadBuffer,
        });

        this.ws.send(message);
    }

    private parseUuid(buf: Buffer): string {
        let part1 = '', part2 = '', part3 = '', part4 = '', part5 = '';
        for (let i = 8; i < 12; i++) part1 += buf[i].toString(16).padStart(2, '0');
        for (let i = 12; i < 14; i++) part2 += buf[i].toString(16).padStart(2, '0');
        for (let i = 14; i < 16; i++) part3 += buf[i].toString(16).padStart(2, '0');
        for (let i = 0; i < 2; i++) part4 += buf[i].toString(16).padStart(2, '0');
        for (let i = 2; i < 8; i++) part5 += buf[i].toString(16).padStart(2, '0');
        return `${part1}-${part2}-${part3}-${part4}-${part5}`;
    }

    private generateUuidBytes(uuidStr: string): Buffer {
        const buf = Buffer.alloc(16);
        const hex = uuidStr.replace(/-/g, '');
        const bytes = Buffer.from(hex, 'hex');
        bytes.copy(buf, 8, 0, 4);
        bytes.copy(buf, 12, 4, 6);
        bytes.copy(buf, 14, 6, 8);
        bytes.copy(buf, 0, 8, 10);
        bytes.copy(buf, 2, 10, 16);
        return buf;
    }

    _read() {}

    _write(chunk: Buffer, encoding: string, callback: (error?: Error | null) => void) {
        if (this.isClosed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return callback(new Error('WebSocket is not open'));
        }

        if (!this.handshakeReady) {
            // 아직 에이전트가 대상에 연결되지 않았을 수 있다. 지금 보내면 조용히 유실되니
            // HandshakeComplete(또는 handshake 없는 세션의 첫 Output)까지 순서대로 쌓아둔다.
            this.pendingActions.push(() => this.sendInputData(chunk, callback));
            return;
        }

        this.sendInputData(chunk, callback);
    }

    private sendInputData(chunk: Buffer, callback: (error?: Error | null) => void) {
        try {
            const encoded = this.encodeMessage({
                messageType: 'input_stream_data',
                sequenceNumber: Number(this.sequenceNumber++),
                flags: 0,
                payloadType: 1, // INPUT_TYPE
                payload: chunk,
            });

            this.ws!.send(encoded);
            callback();
        } catch (err) {
            callback(err as Error);
        }
    }

    private flushPendingWrites() {
        const queued = this.pendingActions;
        this.pendingActions = [];
        for (const action of queued) {
            action();
        }
    }

    _destroy(err: Error | null, callback: (error?: Error | null) => void) {
        this.isClosed = true;
        if (this.ws) {
            try {
                this.ws.close();
            } catch (e) {}
        }
        callback(err);
    }
}
