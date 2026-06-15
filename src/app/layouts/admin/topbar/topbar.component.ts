import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { DialogService } from '../../../core/services/dialog.service';
import { roleLabel } from '../../../core/constants/user-roles.const';
import { NavCountsStore } from '../../../core/stores/nav-counts.store';

@Component({
  selector: 'app-topbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
})
export class TopbarComponent {
  private readonly authService = inject(AuthService);
  protected readonly layout = inject(LayoutService);
  protected readonly config = inject(DialogService);
  protected readonly counts = inject(NavCountsStore);

  protected readonly searchQuery = signal('');
  protected readonly currentUser = this.authService.currentUser;

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
