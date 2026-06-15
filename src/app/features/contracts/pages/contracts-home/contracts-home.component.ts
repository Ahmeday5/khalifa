import {
  ChangeDetectionStrategy, Component, computed, inject, OnInit, signal,
} from '@angular/core';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ToastService } from '../../../../core/services/toast.service';
import { ContractsService } from '../../services/contracts.service';
import { Contract } from '../../models/contract.model';

import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-contracts-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyArPipe, RouterModule],
  templateUrl: './contracts-home.component.html',
  styleUrl: './contracts-home.component.scss',
})
export class ContractsHomeComponent {
  private readonly svc   = inject(ContractsService);
  private readonly toast = inject(ToastService);

  protected readonly contracts    = signal<Contract[]>([]);
  protected readonly selectedId   = signal<string>('');

  protected readonly selected = computed(() =>
    this.contracts().find(c => c.id === this.selectedId()) ?? null
  );


  protected selectContract(id: string): void { this.selectedId.set(id); }

  protected printContract(): void {
    this.toast.info('جاري فتح نافذة الطباعة...');
    window.print();
  }

  protected sendWhatsApp(): void {
    const c = this.selected();
    if (!c) return;
    this.toast.success(`تم إرسال العقد لـ ${c.customerName} عبر WhatsApp`);
  }
}
