import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface TabItem {
  path: string;
  label: string;
}

@Component({
  selector: 'app-customers-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './customers-shell.component.html',
  styleUrl: './customers-shell.component.scss',
})
export class CustomersShellComponent {
  protected readonly tabs: TabItem[] = [
    { path: 'customer-list', label: 'قائمة العملاء' },
    { path: 'contract', label: 'عقد جديد' },
    { path: 'payment', label: 'تسديد دفعة' },
    { path: 'statement', label: 'كشف الحساب' },
  ];
}
