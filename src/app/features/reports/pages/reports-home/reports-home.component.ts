import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ToastService } from '../../../../core/services/toast.service';
import { ReportsService } from '../../services/reports.service';
import { ReportCard } from '../../models/report.model';

@Component({
  selector: 'app-reports-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports-home.component.html',
  styleUrl: './reports-home.component.scss',
})
export class ReportsHomeComponent implements OnInit {
  private readonly reportsService = inject(ReportsService);
  private readonly toast = inject(ToastService);

  protected readonly reports = signal<ReportCard[]>([]);

  ngOnInit(): void {
    this.reportsService.getReportCards().subscribe((cards) => this.reports.set(cards));
  }

  protected generateReport(report: ReportCard): void {
    this.toast.info(`جاري إعداد ${report.title}...`);
    this.reportsService.generate(report.id).subscribe();
  }
}
