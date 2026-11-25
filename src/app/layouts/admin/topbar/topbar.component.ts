import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { AccessService } from '../../../core/services/access.service';
import { LayoutService } from '../../../core/services/layout.service';
import { DialogService } from '../../../core/services/dialog.service';
import { roleLabel } from '../../../core/constants/user-roles.const';
import { NavCountsStore } from '../../../core/stores/nav-counts.store';
import { NotificationsBellComponent } from '../../../features/push-notifications/components/notifications-bell/notifications-bell.component';

@Component({
  selector: 'app-topbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, NotificationsBellComponent],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
})
export class TopbarComponent {
  private readonly authService = inject(AuthService);
  protected readonly layout = inject(LayoutService);
  protected readonly config = inject(DialogService);
  protected readonly counts = inject(NavCountsStore);
  protected readonly access = inject(AccessService);

  protected readonly searchQuery = signal('');
  protected readonly currentUser = this.authService.currentUser;

  /** Pills link to their screens, so each one shows only if that screen is reachable. */
  protected readonly showLowStock = computed(
    () => this.access.canViewInventory() && this.counts.lowStockProducts() > 0,
  );
  protected readonly showOverdue = computed(
    () => this.access.canViewClients() && this.counts.overdueClients() > 0,
  );
  protected readonly showPendingOrders = computed(
    () => this.access.canViewClients() && this.counts.pendingClientOrders() > 0,
  );
  /** "نظام سليم" — only when none of the pills the user can see are active. */
  protected readonly allClear = computed(
    () =>
      !this.counts.loading() &&
      !this.showLowStock() &&
      !this.showOverdue() &&
      !this.showPendingOrders(),
  );

  onSearch(): void {
    // TODO: global search
  }

  logout(): void {
    this.config
      .confirm({
        title: 'تسجيل الخروج',
        message: 'هل أنت متأكد أنك تريد تسجيل الخروج؟',
        type: 'warning',
      })
      .then((confirmed) => {
        if (confirmed) {
          this.authService.logout();
          this.layout.closeMobile();
        }
      });
  }

  getRoleLabel(): string {
    return roleLabel(this.currentUser()?.role);
  }
}
