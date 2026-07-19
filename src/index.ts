import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileProvider } from 'tabby-core';

import { AwsSsmSshProfileProvider } from './profiles';
import { AwsSsmSshSettingsComponent } from './components/awsSsmSshSettings.component';
import { TunnelSshTabComponent } from './components/tunnelSshTab.component';
import { PrivateKeyPromptModalComponent } from './components/privateKeyPromptModal.component';

console.log('[tabby-aws-ssm-ssh] module loaded');

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
    ],
    declarations: [
        AwsSsmSshSettingsComponent,
        TunnelSshTabComponent,
        PrivateKeyPromptModalComponent,
    ],
    exports: [
        AwsSsmSshSettingsComponent,
        TunnelSshTabComponent,
    ],
    providers: [
        { provide: ProfileProvider, useClass: AwsSsmSshProfileProvider, multi: true },
    ],
})
export default class TunnelSshModule { }
