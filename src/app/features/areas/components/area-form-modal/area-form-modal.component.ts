import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import {
  FormMode,
  formModeSubmitLabel,
  formModeTitle,
} from '../../../../shared/models/form-mode.model';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { Area, CreateAreaPayload, UpdateAreaPayload } from '../../models/area.model';
import { AreasService } from '../../services/areas.service';

@Component({
  selector: 'app-area-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent],
  templateUrl: './area-form-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AreaFormModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly mode = input<FormMode>('create');
  readonly area = input<Area | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly saved = output<Area>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AreasService);
  private readonly toast = inject(ToastService);

  // ── state ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  // ── derived ──
  protected readonly isCreate = computed(() => this.mode() === 'create');
  protected readonly title = computed(() => formModeTitle(this.mode(), 'منطقة'));
  protected readonly submitLabel = computed(() => formModeSubmitLabel(this.mode()));

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.serverError.set(null);
        this.submitting.set(false);
        this.resetFormToInputs();
      },
      { allowSignalWrites: true },
    );
  }

  protected onSubmit(): void {
    if (this.submitting()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const isCreate = this.isCreate();

    this.serverError.set(null);
    this.submitting.set(true);

    const stream$ = isCreate
      ? this.service.create(this.toPayload(raw))
      : this.service.update(this.area()!.id, this.toPayload(raw));

    stream$.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(isCreate ? 'تم إضافة المنطقة بنجاح' : 'تم حفظ التعديلات');
        this.saved.emit(res);
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.serverError.set(err.message || 'تعذّر حفظ المنطقة');
      },
    });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  protected isInvalid(field: keyof typeof this.form.controls): boolean {
    const ctrl = this.form.controls[field];
    return ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  // ─────────── internals ───────────

  private resetFormToInputs(): void {
    const a = this.area();
    if (a && !this.isCreate()) {
      this.form.reset({ name: a.name });
      return;
    }
    this.form.reset({ name: '' });
  }

  private toPayload(raw: { name: string }): CreateAreaPayload | UpdateAreaPayload {
    return { name: raw.name.trim() };
  }
}
