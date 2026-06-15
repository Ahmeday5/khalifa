import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { ReportCard } from '../models/report.model';
// import { ApiService } from '../../../core/services/api.service'; // فعّل عند ربط API

@Injectable({ providedIn: 'root' })
export class ReportsService {
  // private readonly api = inject(ApiService);

  getReportCards(): Observable<ReportCard[]> {
    return of(REPORT_CARDS).pipe(delay(100));
  }

  generate(_reportId: string): Observable<void> {
    // TODO: replace with `return this.api.post<void>(\`reports/${_reportId}/generate\`, {});`
    return of(undefined).pipe(delay(1000));
  }
}

const REPORT_CARDS: ReportCard[] = [
  { id: 'collection',  title: 'تقرير التحصيل',   description: 'إجمالي المبالغ المحصّلة حسب الفترة الزمنية والمندوب والعميل', icon: '💰', color: 'gr', action: 'عرض التقرير'  },
  { id: 'late',        title: 'تقرير المتأخرين',  description: 'قائمة شاملة بالعملاء المتأخرين وإجمالي المبالغ المتأخرة',    icon: '⚠️', color: 'am', action: 'عرض القائمة'  },
  { id: 'profit',      title: 'تقرير الأرباح',    description: 'هامش الربح الشهري والسنوي مقارنةً بالمستهدف',                icon: '📈', color: 'bl', action: 'عرض التحليل'  },
  { id: 'vat',         title: 'تقرير الضريبة',    description: 'ضريبة القيمة المضافة المحصّلة والمستحقة للهيئة العامة للزكاة', icon: '📋', color: 'pu', action: 'عرض التقرير'  },
  { id: 'inventory',   title: 'تقرير المخزون',    description: 'حركة المخزون الداخلة والخارجة وتقييم قيمة المخزون الحالي',   icon: '📦', color: 'te', action: 'عرض التقرير'  },
  { id: 'reps',        title: 'تقرير المندوبين',  description: 'أداء كل مندوب من حيث عدد العقود وإجمالي التحصيل',             icon: '👥', color: 're', action: 'عرض التقرير'  },
];
