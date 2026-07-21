import { Injectable } from '@angular/core';
import { ProfileProvider, NewTabParameters, PartialProfile } from 'tabby-core';
import { ConnectableTerminalProfile } from 'tabby-terminal';
import { AwsSsmSshSettingsComponent } from './components/awsSsmSshSettings.component';
import { TunnelSshTabComponent } from './components/tunnelSshTab.component';

export interface AwsSsmSshProfile extends ConnectableTerminalProfile {
    options: {
        username: string;
        region: string;
        instanceId: string;

        // 'ssm': SSH 없이 SSM 에이전트가 직접 여는 셸(IAM 권한만 있으면 됨, 인스턴스에 키 페어 불필요).
        // 'ssh': AWS-StartSSHSession으로 22번 포트를 터널링해서 실제 sshd에 SSH로 접속(개인키 필요).
        connectionMode?: 'ssm' | 'ssh';

        // AWS SSM 터널링 (로컬 프로필, 직접 입력 또는 KeePass 이용)
        awsAuthMethod?: 'profile' | 'static' | 'keypass';
        awsProfile?: string;
        awsAccessKeyId?: string;
        awsSecretAccessKey?: string;

        // SSH 인증 관련 자격증명
        sshAuthMethod?: 'static' | 'keypass';
        privateKey?: string;
        privateKeyPath?: string;
        // SSH 개인키로 쓸 KeePass 엔트리의 첨부파일명 (엔트리는 항상 instanceId로 조회)
        keepassPrivateKeyAttachment?: string;
    };
}

@Injectable({ providedIn: 'root' })
export class AwsSsmSshProfileProvider extends ProfileProvider<AwsSsmSshProfile> {
    id = 'aws-ssm-ssh';
    name = 'AWS SSM SSH';
    settingsComponent = AwsSsmSshSettingsComponent as any;

    configDefaults = {
        options: {
            username: 'ec2-user',
            region: 'us-east-1',
            instanceId: '',
            connectionMode: 'ssm',
            awsAuthMethod: undefined,
            awsProfile: 'default',
            awsAccessKeyId: undefined,
            sshAuthMethod: 'static',
            privateKeyPath: undefined,
            keepassPrivateKeyAttachment: undefined,
        },
    };

    async getBuiltinProfiles(): Promise<PartialProfile<AwsSsmSshProfile>[]> {
        return [
            {
                id: 'aws-ssm-ssh:template',
                type: 'aws-ssm-ssh',
                name: 'AWS SSM SSH Connection',
                icon: 'fas fa-server',
                options: {
                    username: 'ec2-user',
                    region: 'us-east-1',
                    instanceId: '',
                    connectionMode: 'ssm',
                    awsProfile: 'default',
                    sshAuthMethod: 'static',
                },
                isBuiltin: true,
                isTemplate: true,
                weight: -1,
            } as any,
        ];
    }

    async getNewTabParameters(profile: AwsSsmSshProfile): Promise<NewTabParameters<TunnelSshTabComponent>> {
        return {
            type: TunnelSshTabComponent,
            inputs: {
                profile,
            },
        };
    }

    getDescription(profile: AwsSsmSshProfile): string {
        if (!profile.options?.instanceId) return '';
        return `${profile.options.instanceId} (${profile.options.region})`;
    }
}

