import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { AuditEntry, AuditAction } from '../models/audit.model';
import { generateUUID } from '../../../shared/utils/uuid.util';
// import { ApiService } from '../../../core/services/api.service'; // فعّل عند ربط API

export interface AuditFilter {
  action?: AuditAction;
  userId?: string;
  entity?: string;
  from?: string;
  to?: string;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  // private readonly api = inject(ApiService);

  getAll(filter?: AuditFilter): Observable<AuditEntry[]> {
    // استبدل بـ: return this.api.get<AuditEntry[]>('audit', filter as Record<string, string>);
    let result = [...MOCK_AUDIT];
    if (filter?.action) result = result.filter((e) => e.action === filter.action);
    if (filter?.entity) result = result.filter((e) => e.entity === filter.entity);
    return of(result).pipe(delay(250));
  }

  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Observable<AuditEntry> {
    const newEntry: AuditEntry = {
      ...entry,
      id: generateUUID(),
      timestamp: new Date().toISOString(),
    };
    MOCK_AUDIT.unshift(newEntry);
    return of(newEntry).pipe(delay(100));
  }
}

let MOCK_AUDIT: AuditEntry[] = [
  { id: '1', timestamp: '2025-04-08T09:30:00', userId: '1', userName: 'محمد الفاتح',   userRole: 'admin',   action: 'login',   entity: 'auth',      entityId: null, description: 'تسجيل دخول ناجح',                             ipAddress: '192.168.1.1' },
  { id: '2', timestamp: '2025-04-08T09:35:00', userId: '1', userName: 'محمد الفاتح',   userRole: 'admin',   action: 'payment', entity: 'customers', entityId: '1',  description: 'تسجيل دفعة قسط — عبدالله العمري — 700 ج.م', ipAddress: '192.168.1.1' },
  { id: '3', timestamp: '2025-04-08T10:00:00', userId: '2', userName: 'سلمى المنصور',  userRole: 'manager', action: 'create',  entity: 'customers', entityId: '6',  description: 'إضافة عميل جديد — أحمد السعدي',              ipAddress: '192.168.1.5' },
  { id: '4', timestamp: '2025-04-08T10:30:00', userId: '1', userName: 'محمد الفاتح',   userRole: 'admin',   action: 'delete',  entity: 'suppliers', entityId: '3',  description: 'حذف مورد — مستودع قديم',                      ipAddress: '192.168.1.1' },
  { id: '5', timestamp: '2025-04-08T11:00:00', userId: '3', userName: 'يعقوب الحارثي', userRole: 'cashier', action: 'export',  entity: 'reports',   entityId: null, description: 'تصدير تقرير التحصيل الشهري',                  ipAddress: '192.168.1.8' },
];
