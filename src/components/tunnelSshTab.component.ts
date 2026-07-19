import { Component, Injector } from '@angular/core';
import { BaseTerminalTabComponent, ConnectableTerminalTabComponent } from 'tabby-terminal';
import { TunnelSshSession } from '../session/tunnelSsh.session';
import { AwsSsmSshProfile } from '../profiles';

@Component({
    selector: 'tunnel-ssh-tab',
    template: BaseTerminalTabComponent.template,
    styles: BaseTerminalTabComponent.styles,
    animations: BaseTerminalTabComponent.animations,
})
export class TunnelSshTabComponent extends ConnectableTerminalTabComponent<AwsSsmSshProfile> {
    session: TunnelSshSession | null = null;

    constructor(protected injector: Injector) {
        super(injector);
    }

    ngOnInit(): void {
        this.logger = this.log.create('tunnel-ssh-tab');
        super.ngOnInit();
    }

    async initializeSession(): Promise<void> {
        await super.initializeSession();

        const session = new TunnelSshSession(this.injector, this.profile);
        this.setSession(session);

        try {
            await session.start();
            if (this.size) {
                session.resize(this.size.columns, this.size.rows);
            }
        } catch (e: any) {
            this.write('\r\n\x1b[31m' + e.message + '\x1b[0m\r\n');
        }
    }
}
