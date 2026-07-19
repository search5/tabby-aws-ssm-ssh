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

export class AwsSsmTunnelStream extends Duplex {
    private ws: WebSocket | null = null;
    private sequenceNumber = BigInt(0);
    private isClosed = false;

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
                    const message = this.decodeMessage(Buffer.from(data));

                    // MessageType이 output_stream_data 인 경우 처리
                    if (message.messageType.trim() === 'output_stream_data') {
                        // SSH 클라이언트로 바이너리 전송
                        this.push(message.payload);

                        // ACK 전송
                        this.sendAck(message);
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

        try {
            const encoded = this.encodeMessage({
                messageType: 'input_stream_data',
                sequenceNumber: Number(this.sequenceNumber++),
                flags: 0,
                payloadType: 1, // INPUT_TYPE
                payload: chunk,
            });

            this.ws.send(encoded);
            callback();
        } catch (err) {
            callback(err as Error);
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
