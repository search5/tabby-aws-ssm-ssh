import { Injectable } from '@angular/core';
import { VaultService, VaultSecretKey } from 'tabby-core';
import { AwsSsmSshProfile } from '../profiles';

export const VAULT_SECRET_TYPE_AWS_SECRET_KEY = 'aws-ssm-ssh:aws-secret-access-key';
export const VAULT_SECRET_TYPE_SSH_PRIVATE_KEY = 'aws-ssm-ssh:ssh-private-key';

@Injectable({ providedIn: 'root' })
export class AwsSsmVaultStorageService {
    constructor (private vault: VaultService) { }

    isEnabled (): boolean {
        return this.vault.isEnabled();
    }

    async hasAwsSecretAccessKey (profile: AwsSsmSshProfile): Promise<boolean> {
        return !!(await this.vault.getSecret(VAULT_SECRET_TYPE_AWS_SECRET_KEY, this.awsKey(profile)));
    }

    async saveAwsSecretAccessKey (profile: AwsSsmSshProfile, value: string): Promise<void> {
        await this.save(VAULT_SECRET_TYPE_AWS_SECRET_KEY, this.awsKey(profile), value);
    }

    async loadAwsSecretAccessKey (profile: AwsSsmSshProfile): Promise<string | null> {
        return (await this.vault.getSecret(VAULT_SECRET_TYPE_AWS_SECRET_KEY, this.awsKey(profile)))?.value ?? null;
    }

    async deleteAwsSecretAccessKey (profile: AwsSsmSshProfile): Promise<void> {
        await this.vault.removeSecret(VAULT_SECRET_TYPE_AWS_SECRET_KEY, this.awsKey(profile));
    }

    async hasSshPrivateKey (profile: AwsSsmSshProfile): Promise<boolean> {
        return !!(await this.vault.getSecret(VAULT_SECRET_TYPE_SSH_PRIVATE_KEY, this.sshKey(profile)));
    }

    async saveSshPrivateKey (profile: AwsSsmSshProfile, value: string): Promise<void> {
        await this.save(VAULT_SECRET_TYPE_SSH_PRIVATE_KEY, this.sshKey(profile), value);
    }

    async loadSshPrivateKey (profile: AwsSsmSshProfile): Promise<string | null> {
        return (await this.vault.getSecret(VAULT_SECRET_TYPE_SSH_PRIVATE_KEY, this.sshKey(profile)))?.value ?? null;
    }

    async deleteSshPrivateKey (profile: AwsSsmSshProfile): Promise<void> {
        await this.vault.removeSecret(VAULT_SECRET_TYPE_SSH_PRIVATE_KEY, this.sshKey(profile));
    }

    // Vault 시크릿은 profile.id가 아니라 연결 대상의 의미적 식별자로 키를 잡는다.
    // 새 프로필 생성 중에는 profile.id가 아직 비어 있어(저장 시점에야 발급됨) id 기반 키를 쓸 수 없고,
    // tabby-ssh의 PasswordStorageService도 동일하게 host/user 같은 의미적 키를 사용한다.
    private awsKey (profile: AwsSsmSshProfile): VaultSecretKey {
        return { instanceId: profile.options.instanceId, region: profile.options.region } as VaultSecretKey;
    }

    private sshKey (profile: AwsSsmSshProfile): VaultSecretKey {
        return { instanceId: profile.options.instanceId, region: profile.options.region, username: profile.options.username } as VaultSecretKey;
    }

    private async save (type: string, key: VaultSecretKey, value: string): Promise<void> {
        const existing = await this.vault.getSecret(type, key);
        if (existing) {
            await this.vault.updateSecret(existing, { type, key, value });
        } else {
            await this.vault.addSecret({ type, key, value });
        }
    }
}
