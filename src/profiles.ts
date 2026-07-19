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

        // KeePass 검색어 (AWS 자격증명용 엔트리 조회에만 사용, 기본값은 instanceId)
        keepassSearchTerm?: string;
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
            awsProfile: 'default',
            sshAuthMethod: 'static',
            keepassSearchTerm: '',
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
                    awsProfile: 'default',
                    sshAuthMethod: 'static',
                    keepassSearchTerm: '',
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

