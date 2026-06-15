import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { AppUsersService } from '../../services/app-users.service';
import { AppUser, RoleOption } from '../../models/app-user.model';
import { AppUserFormModalComponent } from '../../components/app-user-form-modal/app-user-form-modal.component';
import { FormMode } from '../../../../shared/models/form-mode.model';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { roleLabel } from '../../../../core/constants/user-roles.const';
import { BadgeType } from '../../../../shared/components/badge/badge.component';

const ROLE_BADGE_MAP: Record<string, BadgeType> = {
  Admin: 'bad',
  GeneralManager: 'purple',
  Supervisor: 'warn',
  Accountant: 'ok',
  Representative: 'teal',
  Client: 'info',
};

@Component({
  selector: 'app-users-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, AppUserFormModalComponent],
  templateUrl: './users-list.component.html',
  styleUrl: './users-list.component.scss',
})
export class UsersListComponent implements OnInit {
  private readonly service = inject(AppUsersService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly users = signal<AppUser[]>([]);
  protected readonly loading = signal(false);
  protected readonly roles = signal<RoleOption[]>([]);

  // Form-modal state
  protected readonly modalOpen = signal(false);
  protected readonly modalMode = signal<FormMode>('create');
  protected readonly modalUser = signal<AppUser | null>(null);

  // Tracks which row is currently being deleted (for inline button-state).
  protected readonly deletingId = signal<string | null>(null);

  protected readonly hasUsers = computed(() => this.users().length > 0);

  ngOnInit(): void {
    this.loadUsers();
    // Warm the roles cache so the form modal opens instantly.
    this.service.getRoles().subscribe({
      next: (rs) => this.roles.set(rs),
      error: () => {/* error already toasted by interceptor */},
    });
  }

  protected loadUsers(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (list) => {
        this.users.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected refreshUsers(): void {
    this.loading.set(true);
    this.service.refreshList().subscribe({
      next: (list) => {
        this.users.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected openCreate(): void {
    this.modalUser.set(null);
    this.modalMode.set('create');
    this.modalOpen.set(true);
  }

  protected openEdit(user: AppUser): void {
    this.modalUser.set(user);
    this.modalMode.set('edit');
    this.modalOpen.set(true);
  }

  protected openView(user: AppUser): void {
    this.modalUser.set(user);
    this.modalMode.set('view');
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  protected onSaved(saved: AppUser): void {
    const wasCreate = this.modalMode() === 'create';
    this.users.update((list) =>
      wasCreate ? [saved, ...list] : list.map((u) => (u.id === saved.id ? saved : u)),
    );
    this.modalOpen.set(false);
  }

  protected async confirmDelete(user: AppUser): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'حذف مستخدم',
      message: `هل أنت متأكد من حذف "${user.email}"؟ هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingId.set(user.id);
    this.service.delete(user.id).subscribe({
      next: () => {
        this.users.update((list) => list.filter((u) => u.id !== user.id));
        this.deletingId.set(null);
        this.toast.success('تم حذف المستخدم بنجاح');
      },
      error: (_err: ApiError) => this.deletingId.set(null),
    });
  }

  protected getRoleLabel(roleId: string): string {
    const fromCatalog = this.roles().find((r) => r.id === roleId)?.nameAr;
    return fromCatalog ?? roleLabel(roleId as never);
  }

  protected getRoleBadge(roleId: string): BadgeType {
    return ROLE_BADGE_MAP[roleId] ?? 'info';
  }

  protected initials(email: string): string {
    if (!email) return '?';
    const local = email.split('@')[0] || '';
    const parts = local.split(/[._-]/).filter(Boolean);
    const first = parts[0]?.[0] ?? local[0] ?? '?';
    const second = parts[1]?.[0] ?? '';
    return (first + second).toUpperCase();
  }
}
