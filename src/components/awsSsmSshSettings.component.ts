import { Component, Input, Injector } from '@angular/core';
import { ProfileSettingsComponent, LocaleService, PromptModalComponent } from 'tabby-core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AwsSsmSshProfile } from '../profiles';
import { AwsSsmVaultStorageService } from '../services/awsSsmVaultStorage.service';
import { PrivateKeyPromptModalComponent } from './privateKeyPromptModal.component';
import { resolveKeePassService, getKeePassBinaryBuffer, classifyKeePassPrivateKey } from '../session/tunnelSsh.session';

// 언어를 추가하려면 src/locale/<code>.json 파일만 만들고 여기 등록하면 됨.
// @ngx-translate/core는 Tabby가 플러그인에 노출하지 않는 모듈이라 TranslateService를 직접
// 주입할 수 없으므로, tabby-core가 노출하는 LocaleService로 현재 언어를 읽어 자체 사전을 조회한다.
const locales: Record<string, Record<string, string>> = {
    en: require('../locale/en.json'),
    ko: require('../locale/ko.json'),
};

@Component({
    selector: 'aws-ssm-ssh-profile-settings',
    template: `
        <div class="form-group row mb-3">
            <label class="col-sm-3 col-form-label">Username</label>
            <div class="col-sm-9">
                <input type="text" class="form-control" [(ngModel)]="profile.options.username" placeholder="e.g. ec2-user" />
            </div>
        </div>

        <div class="form-group row mb-3">
            <label class="col-sm-3 col-form-label">AWS Region</label>
            <div class="col-sm-9">
                <input type="text" class="form-control" [(ngModel)]="profile.options.region" placeholder="e.g. us-east-1" />
            </div>
        </div>

        <div class="form-group row mb-3">
            <label class="col-sm-3 col-form-label">Instance ID</label>
            <div class="col-sm-9">
                <input type="text" class="form-control" [(ngModel)]="profile.options.instanceId" placeholder="i-xxxxxxxxxxxxxxxxx" />
            </div>
        </div>

        <hr />
        <h5 class="mb-3">AWS Connection Configuration</h5>

        <div class="form-group row mb-3">
            <label class="col-sm-3 col-form-label">{{ t('AWS Connection Auth') }}</label>
            <div class="col-sm-9">
                <select class="form-control" [(ngModel)]="awsAuthMethod">
                    <option [ngValue]="null">{{ t('Select an authentication method') }}</option>
                    <option [ngValue]="'profile'">{{ t('Use AWS Profile') }}</option>
                    <option [ngValue]="'static'">{{ t('Static Access Key / Secret') }}</option>
                    <option [ngValue]="'keypass'">{{ t('Retrieve from KeePass') }}</option>
                </select>
            </div>
        </div>

        <!-- AWS Profile -->
        <div class="form-group row mb-3" *ngIf="profile.options.awsAuthMethod === 'profile'">
            <label class="col-sm-3 col-form-label">AWS Profile Name</label>
            <div class="col-sm-9">
                <select class="form-control" [(ngModel)]="profile.options.awsProfile">
                    <option *ngFor="let p of awsProfiles" [value]="p">{{ p }}</option>
                </select>
            </div>
        </div>

        <!-- Static Access Key / Secret -->
        <div *ngIf="profile.options.awsAuthMethod === 'static'">
            <div class="form-group row mb-3">
                <label class="col-sm-3 col-form-label">{{ t('AWS Access Key ID') }}</label>
                <div class="col-sm-9">
                    <input type="text" class="form-control" [(ngModel)]="profile.options.awsAccessKeyId" placeholder="AKIAXXXXXXXXXXXXXXXX" autocomplete="off" />
                </div>
            </div>

            <div class="form-group row mb-3">
                <label class="col-sm-3 col-form-label">{{ t('AWS Secret Access Key') }}</label>
                <div class="col-sm-9">
                    <div *ngIf="!vaultEnabled" class="text-muted small">{{ t('Enable Vault in Settings to store this securely.') }}</div>
                    <ng-container *ngIf="vaultEnabled">
                        <button type="button" class="btn btn-secondary btn-sm" [disabled]="!profile.options.instanceId" (click)="setAwsSecretAccessKey()">
                            {{ hasAwsSecretAccessKey ? t('Change') : t('Set') }}
                        </button>
                        <button type="button" *ngIf="hasAwsSecretAccessKey" class="btn btn-link btn-sm text-danger" (click)="clearAwsSecretAccessKey()">{{ t('Clear') }}</button>
                        <div class="text-muted small mt-1">
                            {{ hasAwsSecretAccessKey ? t('Stored in Vault.') : (profile.options.instanceId ? '' : t('Enter Instance ID first.')) }}
                        </div>
                    </ng-container>
                </div>
            </div>
        </div>

        <hr />
        <h5 class="mb-3">SSH Login Configuration</h5>

        <div class="form-group row mb-3">
            <label class="col-sm-3 col-form-label">SSH Auth Method</label>
            <div class="col-sm-9">
                <select class="form-control" [(ngModel)]="profile.options.sshAuthMethod" (change)="onSshAuthMethodChange()">
                    <option value="static">Manual Input / Private Key Path</option>
                    <option value="keypass">Retrieve from KeePass</option>
                </select>
            </div>
        </div>

        <!-- SSH Static Credentials -->
        <div *ngIf="profile.options.sshAuthMethod === 'static'">
            <div class="form-group row mb-3">
                <label class="col-sm-3 col-form-label">Private Key Path</label>
                <div class="col-sm-9">
                    <input type="text" class="form-control" [(ngModel)]="profile.options.privateKeyPath" placeholder="/path/to/id_rsa" />
                </div>
            </div>

            <div class="form-group row mb-3">
                <label class="col-sm-3 col-form-label">{{ t('Private Key Content') }}</label>
                <div class="col-sm-9">
                    <div *ngIf="!vaultEnabled" class="text-muted small">{{ t('Enable Vault in Settings to store this securely.') }}</div>
                    <ng-container *ngIf="vaultEnabled">
                        <button type="button" class="btn btn-secondary btn-sm" [disabled]="!profile.options.instanceId" (click)="setSshPrivateKey()">
                            {{ hasSshPrivateKey ? t('Change') : t('Set') }}
                        </button>
                        <button type="button" *ngIf="hasSshPrivateKey" class="btn btn-link btn-sm text-danger" (click)="clearSshPrivateKey()">{{ t('Clear') }}</button>
                        <div class="text-muted small mt-1">
                            {{ hasSshPrivateKey ? t('Stored in Vault.') : (profile.options.instanceId ? '' : t('Enter Instance ID first.')) }}
                        </div>
                    </ng-container>
                </div>
            </div>
        </div>

        <!-- SSH Private Key from KeePass attachment -->
        <div *ngIf="profile.options.sshAuthMethod === 'keypass'">
            <div class="form-group row mb-3">
                <label class="col-sm-3 col-form-label">{{ t('KeePass Attachment') }}</label>
                <div class="col-sm-9">
                    <div class="d-flex" style="gap: 0.5rem;">
                        <select class="form-control" [(ngModel)]="keepassPrivateKeyAttachment" [disabled]="!keepassAttachments.length">
                            <option [ngValue]="null">{{ t('Select a KeePass attachment') }}</option>
                            <option *ngFor="let a of keepassAttachments" [ngValue]="a">{{ a }}</option>
                        </select>
                        <button type="button" class="btn btn-secondary btn-sm" style="white-space: nowrap;" [disabled]="!profile.options.instanceId || loadingKeepassAttachments" (click)="loadKeepassAttachments()">
                            {{ loadingKeepassAttachments ? t('Loading...') : t('Refresh') }}
                        </button>
                    </div>
                    <div class="text-muted small mt-1" *ngIf="!profile.options.instanceId">{{ t('Enter Instance ID first.') }}</div>
                    <div class="text-danger small mt-1" *ngIf="keepassAttachmentsError">{{ keepassAttachmentsError }}</div>
                </div>
            </div>
        </div>
    `,
})
export class AwsSsmSshSettingsComponent implements ProfileSettingsComponent<AwsSsmSshProfile> {
    @Input() profile: any;
    awsProfiles: string[] = ['default'];

    vaultEnabled = false;
    hasAwsSecretAccessKey = false;
    hasSshPrivateKey = false;

    keepassAttachments: string[] = [];
    loadingKeepassAttachments = false;
    keepassAttachmentsError = '';

    constructor (
        private localeService: LocaleService,
        private vaultStorage: AwsSsmVaultStorageService,
        private ngbModal: NgbModal,
        private injector: Injector,
    ) { }

    t (key: string): string {
        const lang = (this.localeService.getLocale() || 'en').slice(0, 2);
        return locales[lang]?.[key] ?? locales.en[key] ?? key;
    }

    // <select>의 플레이스홀더 옵션이 [ngValue]="null"이므로, 매 변경 감지마다 undefined를 null로
    // 정규화해 매칭시킨다. ngOnInit에서 한 번만 정규화하면 profile 입력 객체가 나중에 다른
    // 참조로 교체될 때(새 프로필 생성 흐름에서 실제로 발생) 반영되지 않아 셀렉트가 미선택 상태로 보인다.
    get awsAuthMethod (): string | null {
        return this.profile.options.awsAuthMethod ?? null;
    }

    set awsAuthMethod (value: string | null) {
        this.profile.options.awsAuthMethod = value ?? undefined;
    }

    get keepassPrivateKeyAttachment (): string | null {
        return this.profile.options.keepassPrivateKeyAttachment ?? null;
    }

    set keepassPrivateKeyAttachment (value: string | null) {
        this.profile.options.keepassPrivateKeyAttachment = value ?? undefined;
    }

    async ngOnInit() {
        // profile.options는 Tabby의 프로필 객체에서 getter로만 노출되는 속성이라 통째로
        // 재할당(profile.options = ...)하면 TypeError가 나서 ngOnInit이 그 자리에서 중단된다.
        // 반드시 이미 존재하는 options 객체의 개별 속성만 채워야 한다.
        this.profile.options.username = this.profile.options.username || 'ec2-user';
        this.profile.options.region = this.profile.options.region || 'us-east-1';
        this.profile.options.awsProfile = this.profile.options.awsProfile || 'default';
        this.profile.options.sshAuthMethod = this.profile.options.sshAuthMethod || 'static';

        this.awsProfiles = this.getAwsProfiles();

        this.vaultEnabled = this.vaultStorage.isEnabled();
        if (this.vaultEnabled && this.profile.options.instanceId) {
            this.hasAwsSecretAccessKey = await this.vaultStorage.hasAwsSecretAccessKey(this.profile);
            this.hasSshPrivateKey = await this.vaultStorage.hasSshPrivateKey(this.profile);
        }

        if (this.profile.options.sshAuthMethod === 'keypass') {
            await this.loadKeepassAttachments();
        }
    }

    onSshAuthMethodChange (): void {
        if (this.profile.options.sshAuthMethod === 'keypass') {
            this.loadKeepassAttachments();
        }
    }

    // 첨부파일 이름을 나열만 하는 게 아니라, 각각을 ssh2의 진짜 키 파서로 열어봐서
    // 개인키로 판별되는 것만 드롭다운에 남긴다 (공개키/무관한 파일은 애초에 안 보이게).
    async loadKeepassAttachments (): Promise<void> {
        this.keepassAttachmentsError = '';
        this.keepassAttachments = [];
        if (!this.profile.options.instanceId) {
            return;
        }
        this.loadingKeepassAttachments = true;
        try {
            const keepassService = resolveKeePassService(this.injector);
            if (!keepassService) {
                this.keepassAttachmentsError = this.t('KeePass plugin is not installed or enabled.');
                return;
            }
            const entry = await keepassService['findEntry'](this.profile.options.instanceId, 22);
            if (!entry) {
                this.keepassAttachmentsError = this.t('No matching KeePass entry found.');
                return;
            }
            const names: string[] = entry.binaries ? [...entry.binaries.keys()] : [];
            if (!names.length) {
                this.keepassAttachmentsError = this.t('The KeePass entry has no attachments.');
                return;
            }
            this.keepassAttachments = names.filter(name => {
                const binary = entry.binaries.get(name);
                return classifyKeePassPrivateKey(getKeePassBinaryBuffer(binary)).ok;
            });
            if (!this.keepassAttachments.length) {
                this.keepassAttachmentsError = this.t('No private key attachment found on this entry.');
            }
        } catch (e: any) {
            this.keepassAttachmentsError = e?.message || String(e);
        } finally {
            this.loadingKeepassAttachments = false;
        }
    }

    async setAwsSecretAccessKey (): Promise<void> {
        const modal = this.ngbModal.open(PromptModalComponent);
        modal.componentInstance.prompt = this.t('AWS Secret Access Key');
        modal.componentInstance.password = true;
        const result = await modal.result.catch(() => null);
        if (result?.value) {
            await this.vaultStorage.saveAwsSecretAccessKey(this.profile, result.value);
            this.hasAwsSecretAccessKey = true;
            // 예전 버전이 config에 평문으로 남겨둔 값이 있다면 제거
            delete this.profile.options.awsSecretAccessKey;
        }
    }

    async clearAwsSecretAccessKey (): Promise<void> {
        await this.vaultStorage.deleteAwsSecretAccessKey(this.profile);
        this.hasAwsSecretAccessKey = false;
    }

    async setSshPrivateKey (): Promise<void> {
        const modal = this.ngbModal.open(PrivateKeyPromptModalComponent);
        modal.componentInstance.okLabel = this.t('Set');
        modal.componentInstance.cancelLabel = this.t('Cancel');
        const result = await modal.result.catch(() => null);
        if (result?.value) {
            await this.vaultStorage.saveSshPrivateKey(this.profile, result.value);
            this.hasSshPrivateKey = true;
            // 예전 버전이 config에 평문으로 남겨둔 값이 있다면 제거
            delete this.profile.options.privateKey;
        }
    }

    async clearSshPrivateKey (): Promise<void> {
        await this.vaultStorage.deleteSshPrivateKey(this.profile);
        this.hasSshPrivateKey = false;
    }

    private getAwsProfiles(): string[] {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const profiles: string[] = ['default'];

        try {
            const credPath = path.join(os.homedir(), '.aws', 'credentials');
            const configPath = path.join(os.homedir(), '.aws', 'config');

            const parseFile = (filePath: string) => {
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const matches = content.matchAll(/^\[([^\]]+)\]/gm);
                    for (const match of matches) {
                        let name = match[1].trim();
                        if (name.startsWith('profile ')) {
                            name = name.substring(8).trim();
                        }
                        if (name && !profiles.includes(name)) {
                            profiles.push(name);
                        }
                    }
                }
            };

            parseFile(credPath);
            parseFile(configPath);
        } catch (e) {
            console.error('Failed to parse AWS profiles:', e);
        }

        return profiles;
    }
}
