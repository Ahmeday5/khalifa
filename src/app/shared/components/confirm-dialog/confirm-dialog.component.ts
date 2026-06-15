import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DialogService } from '../../../core/services/dialog.service';
import { ModalComponent } from '../modal/modal.component';

const TYPE_CLASSES = {
  danger: { title: 'cd-title-danger', confirm: 'btn btn-re' },
  warning: { title: 'cd-title-warning', confirm: 'btn btn-am' },
  info: { title: 'cd-title-info', confirm: 'btn btn-bl' },
} as const;

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  protected readonly dialog = inject(DialogService);

  protected readonly state = this.dialog.state;
  protected readonly isOpen = computed(() => this.state().isOpen);
  protected readonly config = computed(() => this.state().config);

  protected readonly titleClass = computed(
    () => TYPE_CLASSES[this.config().type ?? 'danger'].title,
  );
  protected readonly confirmBtnClass = computed(
    () => TYPE_CLASSES[this.config().type ?? 'danger'].confirm,
  );

  confirm(): void {
    this.dialog.handleResponse(true);
  }

  cancel(): void {
    this.dialog.handleResponse(false);
  }
}
