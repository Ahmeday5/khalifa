import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { AuditService } from '../../services/audit.service';
import { AuditEntry, AuditAction } from '../../models/audit.model';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DateArPipe],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.scss',
})
export class AuditLogComponent implements OnInit {
  private readonly auditService = inject(AuditService);

  protected readonly auditLog = signal<AuditEntry[]>([]);

  ngOnInit(): void {
    this.auditService.getAll().subscribe((entries) => this.auditLog.set(entries));
  }

  protected getActionColor(action: AuditAction): string {
    const map: Record<AuditAction, string> = {
      create: 'var(--gr)', update: 'var(--bl)', delete: 'var(--re)',
      login: 'var(--te)', logout: 'var(--txt3)', payment: 'var(--am)', export: 'var(--pu)',
    };
    return map[action];
  }

  protected getRoleBg(role: string): string {
    const map: Record<string, string> = {
      admin: 'var(--re-l)', manager: 'var(--am-l)', cashier: 'var(--gr-l)', viewer: 'var(--bl-l)',
    };
    return map[role] ?? 'var(--bg3)';
  }

  protected getRoleColor(role: string): string {
    const map: Record<string, string> = {
      admin: 'var(--re)', manager: 'var(--am)', cashier: 'var(--gr)', viewer: 'var(--bl)',
    };
    return map[role] ?? 'var(--txt2)';
  }
}
