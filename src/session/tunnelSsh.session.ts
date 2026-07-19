import { BaseSession } from 'tabby-terminal';
import { LogService } from 'tabby-core';
import { Injector } from '@angular/core';
import { Client as SSHClient, ClientChannel } from 'ssh2';
import { Duplex } from 'stream';
import { AwsSsmTunnelStream } from '../tunnel/awsSsm.tunnel';
import { SSMClient, StartSessionCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import { AwsSsmSshProfile } from '../profiles';
import { AwsSsmVaultStorageService } from '../services/awsSsmVaultStorage.service';

// tabby-keepass-ssh는 다른 플러그인이라 정적으로 import할 수 없어 런타임에 동적으로 찾는다.
// KeePassService.findEntry()는 공개 API가 아니지만(private), 실제로 존재하는 유일한 엔트리 조회
// 수단이라 bracket 접근으로 우회해서 사용한다 — 그쪽 플러그인 버전이 바뀌면 깨질 수 있는 리스크는 감수.
export function resolveKeePassService (injector: Injector): any {
    try {
        const { KeePassService } = require('tabby-keepass-ssh') || {};
        if (KeePassService) {
            return injector.get(KeePassService);
        }
    } catch (e) {}

    // tabby-keepass-ssh가 KeePassService를 공개 export하지 않을 경우를 대비한 fallback.
    // (2026-07 기준 실제로 그런 상태 — 아래로는 도달하지 못하고 null이 반환됨)
    try {
        const providers = (injector as any)._providers || [];
        for (const provider of providers) {
            if (provider?.key?.token?.name === 'KeePassService') {
                return injector.get(provider.key.token);
            }
        }
    } catch (e) {}

    return null;
}

// KeePass 엔트리 첨부파일(kdbxweb ProtectedBinary 또는 원시 바이너리)을 UTF-8 텍스트로 읽는다.
export function readKeePassBinaryAsText (binary: any): string {
    const buf = typeof binary?.getBinary === 'function' ? binary.getBinary() : binary;
    return Buffer.from(buf).toString('utf8');
}

export class TunnelSshSession extends BaseSession {
    private sshClient: SSHClient | null = null;
    private shellChannel: ClientChannel | null = null;
    private tunnelStream: Duplex | null = null;
    private cols = 80;
    private rows = 24;

    constructor(
        private injector: Injector,
        public profile: AwsSsmSshProfile
    ) {
        super(injector.get(LogService).create('aws-ssm-session'));
    }

    async start(): Promise<void> {
        this.releaseInitialDataBuffer();

        const emit = (msg: string) => this.emitOutput(Buffer.from(`\x1b[90m[AWS SSM] ${msg}\x1b[0m\r\n`));
        emit('Starting AWS SSM SSH Session...');

        const opts = this.profile.options;
        const awsAuthMethod = opts.awsAuthMethod || 'profile';
        const sshAuthMethod = opts.sshAuthMethod || 'static';

        let awsAccessKeyId: string | undefined;
        let awsSecretAccessKey: string | undefined;
        let privateKey = opts.privateKey; // 예전 버전이 config에 평문으로 저장한 값에 대한 호환 fallback

        try {
            // Vault에 저장된 자격증명 조회 (AWS Access Key/Secret 직접 입력, SSH 개인키 직접 입력)
            const vaultStorage = this.injector.get(AwsSsmVaultStorageService);
            if (awsAuthMethod === 'static') {
                awsAccessKeyId = opts.awsAccessKeyId;
                awsSecretAccessKey = (await vaultStorage.loadAwsSecretAccessKey(this.profile)) ?? opts.awsSecretAccessKey;
                if (!awsSecretAccessKey) {
                    throw new Error('AWS Secret Access Key is not set. Open the profile settings and set it.');
                }
            }
            if (sshAuthMethod === 'static') {
                privateKey = (await vaultStorage.loadSshPrivateKey(this.profile)) ?? privateKey;
            }

            // KeePass 통합 자격증명 조회 (AWS 또는 SSH 인증 중 하나라도 keypass 인 경우 수행)
            // AWS 쪽은 keepassSearchTerm(기본값 instanceId)으로 엔트리를 찾고, SSH 개인키는 항상
            // instanceId로 찾은 엔트리의 첨부파일에서 가져온다 — 서로 다른 엔트리일 수 있으므로 별도로 조회.
            if (awsAuthMethod === 'keypass' || sshAuthMethod === 'keypass') {
                try {
                    const keepassService = resolveKeePassService(this.injector);
                    if (!keepassService) {
                        throw new Error('KeePass SSH plugin is not installed or enabled in Tabby');
                    }

                    if (awsAuthMethod === 'keypass') {
                        emit('Searching KeePass entry for AWS credentials...');
                        const searchTerm = opts.keepassSearchTerm || opts.instanceId;
                        if (!searchTerm) {
                            throw new Error('Instance ID or KeePass Search Term is required to search entry');
                        }

                        const awsEntry = await keepassService['findEntry'](searchTerm, 22);
                        if (!awsEntry) {
                            throw new Error(`No KeePass entry found matching URL "ssh://${searchTerm}"`);
                        }

                        const getField = (fieldName: string): string | undefined => {
                            const f = awsEntry.fields.get(fieldName);
                            if (!f) return undefined;
                            return typeof f.getText === 'function' ? f.getText() : String(f);
                        };

                        const extAccessId = getField('AWS Access ID') || getField('aws_access_key_id') || getField('AWS Access Key ID');
                        const extSecretKey = getField('AWS Secret Key') || getField('aws_secret_access_key') || getField('AWS Secret Access Key');
                        if (extAccessId) {
                            awsAccessKeyId = extAccessId;
                            emit('Loaded AWS Access ID from KeePass.');
                        }
                        if (extSecretKey) {
                            awsSecretAccessKey = extSecretKey;
                            emit('Loaded AWS Secret Key from KeePass.');
                        }
                    }

                    if (sshAuthMethod === 'keypass') {
                        emit('Searching KeePass entry for SSH private key...');
                        if (!opts.instanceId) {
                            throw new Error('Instance ID is required to find the KeePass entry');
                        }
                        if (!opts.keepassPrivateKeyAttachment) {
                            throw new Error('No KeePass attachment selected for the private key. Open profile settings and select one.');
                        }

                        const sshEntry = await keepassService['findEntry'](opts.instanceId, 22);
                        if (!sshEntry) {
                            throw new Error(`No KeePass entry found matching URL "ssh://${opts.instanceId}"`);
                        }

                        const binary = sshEntry.binaries?.get(opts.keepassPrivateKeyAttachment);
                        if (!binary) {
                            throw new Error(`KeePass entry attachment "${opts.keepassPrivateKeyAttachment}" not found`);
                        }

                        privateKey = readKeePassBinaryAsText(binary);
                        emit(`Loaded SSH Private Key from KeePass attachment "${opts.keepassPrivateKeyAttachment}".`);
                    }
                } catch (keepassError: any) {
                    emit(`KeePass Integration Error: ${keepassError.message}`);
                    this.logger.error('KeePass integration failed:', keepassError);
                    throw keepassError;
                }
            }

            // 1. 웹소켓 터널 수립
            emit('Connecting to AWS SSM Tunnel...');
            this.tunnelStream = await this.createAwsSsmTunnel(awsAccessKeyId, awsSecretAccessKey);

            // 2. SSH Client 연결 수립
            emit('Establishing SSH Connection...');
            this.sshClient = new SSHClient();

            const sshConfig: any = {
                sock: this.tunnelStream,
                username: opts.username,
                tryKeyboard: false,
            };

            // 개인키 자격증명 구성 (KeePass 추출 데이터 우선)
            if (privateKey) {
                sshConfig.privateKey = privateKey;
            } else if (opts.privateKeyPath) {
                const fs = require('fs');
                sshConfig.privateKey = fs.readFileSync(opts.privateKeyPath, 'utf8');
            }

            await new Promise<void>((resolve, reject) => {
                this.sshClient!.once('ready', resolve);
                this.sshClient!.once('error', reject);
                this.sshClient!.connect(sshConfig);
            });

            emit('Opening Shell Channel...');
            const channel = await new Promise<ClientChannel>((resolve, reject) => {
                this.sshClient!.shell({ term: 'xterm-256color', cols: this.cols, rows: this.rows }, (err, ch) => {
                    if (err) reject(err);
                    else resolve(ch);
                });
            });

            this.shellChannel = channel;
            this.open = true;
            emit('Connection Established.');

            this.shellChannel.on('data', (data: Buffer) => {
                this.emitOutput(data);
            });

            this.shellChannel.stderr.on('data', (data: Buffer) => {
                this.emitOutput(data);
            });

            this.shellChannel.on('close', () => {
                this.destroy();
            });

        } catch (err: any) {
            emit(`Error: ${err.message}`);
            this.logger.error('Failed to establish Tunnel SSH session:', err);
            this.destroy();
            throw err;
        }
    }

    private async createAwsSsmTunnel(awsAccessKeyId?: string, awsSecretAccessKey?: string): Promise<Duplex> {
        const opts = this.profile.options;
        const awsAuthMethod = opts.awsAuthMethod || 'profile';
        let credentials: any;

        if ((awsAuthMethod === 'keypass' || awsAuthMethod === 'static') && awsAccessKeyId && awsSecretAccessKey) {
            credentials = {
                accessKeyId: awsAccessKeyId,
                secretAccessKey: awsSecretAccessKey,
            };
        } else if (awsAuthMethod === 'profile' && opts.awsProfile) {
            credentials = fromIni({ profile: opts.awsProfile });
        } else {
            credentials = fromIni(); // default profile
        }

        const ssmClient = new SSMClient({
            region: opts.region,
            credentials,
        });

        const command = new StartSessionCommand({
            Target: opts.instanceId,
            DocumentName: 'AWS-StartSSHSession',
            Parameters: {
                portNumber: ['22'],
            },
        });

        const ssmSession = await ssmClient.send(command);

        if (!ssmSession.StreamUrl || !ssmSession.TokenValue) {
            throw new Error('Invalid AWS SSM session response');
        }

        const tunnel = new AwsSsmTunnelStream({
            streamUrl: ssmSession.StreamUrl,
            tokenValue: ssmSession.TokenValue,
        });

        await tunnel.connect();
        return tunnel;
    }

    // BaseSession 구현 필수 메소드
    write(data: Buffer): void {
        this.shellChannel?.write(data);
    }

    resize(columns: number, rows: number): void {
        this.cols = columns;
        this.rows = rows;
        this.shellChannel?.setWindow(rows, columns, 0, 0);
    }

    kill(signal?: string): void {
        this.shellChannel?.end();
    }

    async getWorkingDirectory(): Promise<string | null> {
        return null;
    }

    async gracefullyKillProcess(): Promise<void> {
        this.kill();
    }

    supportsWorkingDirectory(): boolean {
        return false;
    }

    async destroy(): Promise<void> {
        this.shellChannel = null;
        if (this.sshClient) {
            try {
                this.sshClient.end();
            } catch (e) {}
            this.sshClient = null;
        }
        if (this.tunnelStream) {
            try {
                this.tunnelStream.destroy();
            } catch (e) {}
            this.tunnelStream = null;
        }
        await super.destroy();
    }
}
