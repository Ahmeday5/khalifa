import {
  ChangeDetectionStrategy, Component, computed, inject, OnInit, signal,
} from '@angular/core';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ToastService } from '../../../../core/services/toast.service';
import { NotificationsService } from '../../services/notifications.service';
import { LateCustomer, MessageLogEntry, MessageTemplate } from '../../models/notification.model';

@Component({
  selector: 'app-notifications-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyArPipe],
  templateUrl: './notifications-home.component.html',
  styleUrl: './notifications-home.component.scss',
})
export class NotificationsHomeComponent implements OnInit {
  private readonly svc   = inject(NotificationsService);
  private readonly toast = inject(ToastService);

  protected readonly templates      = signal<MessageTemplate[]>([]);
  protected readonly lateCustomers  = signal<LateCustomer[]>([]);
  protected readonly messageLog     = signal<MessageLogEntry[]>([]);
  protected readonly sending        = signal(false);

  protected readonly selectedCount = computed(() =>
    this.lateCustomers().filter(c => c.selected).length
  );

  protected readonly totalLateAmount = computed(() =>
    this.lateCustomers().reduce((s, c) => s + c.amount, 0)
  );

  protected readonly logSuccess = computed(() =>
    this.messageLog().filter(e => e.status === 'sent').length
  );

  protected readonly logFailed = computed(() =>
    this.messageLog().filter(e => e.status === 'failed').length
  );

  ngOnInit(): void {
    this.svc.getTemplates().subscribe(t => this.templates.set(t));
    this.svc.getLateCustomers().subscribe(c => this.lateCustomers.set(c));
    this.svc.getMessageLog().subscribe(l => this.messageLog.set(l));
  }

  protected toggleTemplate(id: string): void {
    this.svc.toggleTemplate(id).subscribe(() => {
      this.templates.update(ts => ts.map(t => t.id === id ? { ...t, isActive: !t.isActive } : t));
    });
  }

  protected toggleCustomer(id: string): void {
    this.lateCustomers.update(cs =>
      cs.map(c => c.id === id ? { ...c, selected: !c.selected } : c)
    );
  }

  protected toggleAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.lateCustomers.update(cs => cs.map(c => ({ ...c, selected: checked })));
  }

  protected sendBulk(): void {
    const selected = this.lateCustomers().filter(c => c.selected);
    if (selected.length === 0) { this.toast.warning('اختر عملاء أولاً'); return; }
    this.sending.set(true);
    this.svc.sendBulk(selected.map(c => c.id)).subscribe(() => {
      this.toast.success(`تم إرسال WhatsApp لـ ${selected.length} عملاء`);
      this.sending.set(false);
    });
  }
}
