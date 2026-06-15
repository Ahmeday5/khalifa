import { Injectable, signal } from '@angular/core';

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export interface DialogState {
  isOpen: boolean;
  config: ConfirmDialogConfig;
  resolve: ((value: boolean) => void) | null;
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialogState = signal<DialogState>({
    isOpen: false,
    config: { title: '', message: '' },
    resolve: null,
  });

  readonly state = this.dialogState.asReadonly();

  confirm(config: ConfirmDialogConfig): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.dialogState.set({
        isOpen: true,
        config: {
          confirmText: 'تأكيد',
          cancelText: 'إلغاء',
          type: 'danger',
          ...config,
        },
        resolve,
      });
    });
  }

  handleResponse(value: boolean): void {
    const current = this.dialogState();
    current.resolve?.(value);
    this.dialogState.set({
      isOpen: false,
      config: { title: '', message: '' },
      resolve: null,
    });
  }
}
