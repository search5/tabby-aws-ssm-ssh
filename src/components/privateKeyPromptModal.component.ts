import { Component, ElementRef, ViewChild } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

// PromptModalComponent(tabby-core)는 <input>(한 줄)만 지원해서, 붙여넣을 때 줄바꿈이 깨져
// PEM 형식의 개인 키가 손상된다. 그래서 textarea를 쓰는 전용 모달을 별도로 둔다.
@Component({
    selector: 'private-key-prompt-modal',
    template: `
        <div class="modal-body">
            <textarea class="form-control" rows="12" style="font-family: monospace;" [(ngModel)]="value" #input></textarea>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" (click)="cancel()">{{ cancelLabel }}</button>
            <button class="btn btn-primary" [disabled]="!value" (click)="ok()">{{ okLabel }}</button>
        </div>
    `,
})
export class PrivateKeyPromptModalComponent {
    value = '';
    okLabel = 'OK';
    cancelLabel = 'Cancel';
    @ViewChild('input') input: ElementRef;

    constructor (private modalInstance: NgbActiveModal) { }

    ngOnInit (): void {
        setTimeout(() => this.input.nativeElement.focus());
    }

    ok (): void {
        this.modalInstance.close({ value: this.value });
    }

    cancel (): void {
        this.modalInstance.close(null);
    }
}
