import { Injectable } from '@angular/core';
import { NewTabParameters, RecoveryToken, TabRecoveryProvider } from 'tabby-core';
import { TunnelSshTabComponent } from './components/tunnelSshTab.component';

@Injectable()
export class AwsSsmSshRecoveryProvider extends TabRecoveryProvider<TunnelSshTabComponent> {
    async applicableTo(recoveryToken: RecoveryToken): Promise<boolean> {
        return recoveryToken.type === 'app:aws-ssm-ssh-tab';
    }

    async recover(recoveryToken: RecoveryToken): Promise<NewTabParameters<TunnelSshTabComponent>> {
        return {
            type: TunnelSshTabComponent,
            inputs: {
                profile: recoveryToken.profile,
                savedState: recoveryToken.savedState,
            },
        };
    }
}
