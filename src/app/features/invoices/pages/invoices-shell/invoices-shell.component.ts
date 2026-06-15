import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface TabItem { path: string; label: string; }

@Component({
  selector: 'app-invoices-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './invoices-shell.component.html',
  styleUrl: './invoices-shell.component.scss',
})
export class InvoicesShellComponent {
  protected readonly tabs: TabItem[] = [
    { path: 'list',    label: 'قائمة الفواتير' },
    { path: 'new',     label: 'فاتورة جديدة'  },
  ];
}
