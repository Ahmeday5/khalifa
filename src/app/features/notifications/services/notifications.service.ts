import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { LateCustomer, MessageLogEntry, MessageTemplate, WhatsAppMessage } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationsService {

  getAll(): Observable<WhatsAppMessage[]> {
    return of([...MOCK_MESSAGES]).pipe(delay(200));
  }

  getTemplates(): Observable<MessageTemplate[]> {
    return of([...MOCK_TEMPLATES]).pipe(delay(100));
  }

  getLateCustomers(): Observable<LateCustomer[]> {
    return of(MOCK_LATE_CUSTOMERS.map(c => ({ ...c }))).pipe(delay(200));
  }

  getMessageLog(): Observable<MessageLogEntry[]> {
    return of([...MOCK_LOG]).pipe(delay(150));
  }

  sendOne(id: string): Observable<WhatsAppMessage> {
    const idx = MOCK_MESSAGES.findIndex((m) => m.id === id);
    if (idx !== -1) {
      MOCK_MESSAGES[idx] = { ...MOCK_MESSAGES[idx], status: 'sent', sentAt: new Date().toISOString() };
    }
    return of(MOCK_MESSAGES[idx]).pipe(delay(500));
  }

  sendAll(): Observable<WhatsAppMessage[]> {
    MOCK_MESSAGES = MOCK_MESSAGES.map((m) =>
      m.status !== 'sent' ? { ...m, status: 'sent' as const, sentAt: new Date().toISOString() } : m
    );
    return of([...MOCK_MESSAGES]).pipe(delay(800));
  }

  sendBulk(customerIds: string[]): Observable<void> {
    return of(undefined).pipe(delay(600));
  }

  toggleTemplate(id: string): Observable<void> {
    const idx = MOCK_TEMPLATES.findIndex(t => t.id === id);
    if (idx !== -1) MOCK_TEMPLATES[idx] = { ...MOCK_TEMPLATES[idx], isActive: !MOCK_TEMPLATES[idx].isActive };
    return of(undefined).pipe(delay(200));
  }
}

let MOCK_MESSAGES: WhatsAppMessage[] = [
  { id: '1', customerName: 'خالد الزهراني', phone: '0551122334', amount: 1200, dueDate: '2025-03-01', status: 'pending', sentAt: null },
  { id: '2', customerName: 'سعد البقمي',    phone: '0561234567', amount: 800,  dueDate: '2025-03-15', status: 'pending', sentAt: null },
  { id: '3', customerName: 'منى الشهري',    phone: '0572345678', amount: 650,  dueDate: '2025-02-28', status: 'sent',    sentAt: '2025-04-01' },
  { id: '4', customerName: 'ريم العتيبي',   phone: '0583456789', amount: 950,  dueDate: '2025-04-01', status: 'failed',  sentAt: null },
  { id: '5', customerName: 'عمر الدوسري',   phone: '0594567890', amount: 1100, dueDate: '2025-03-20', status: 'pending', sentAt: null },
];

let MOCK_TEMPLATES: MessageTemplate[] = [
  {
    id: '1', name: 'تذكير قسط مستحق (قبل 3 أيام)', isActive: true,
    trigger: 'تُرسل تلقائياً قبل 3 أيام من الاستحقاق',
    title: 'تقسيط برو 📋',
    body: 'السلام عليكم {اسم_العميل}، نذكركم بأن قسطكم البالغ {مبلغ_القسط} ج.م مستحق في {تاريخ_القسط}. يرجى السداد في الموعد المحدد. شكراً لتعاملكم معنا.',
  },
  {
    id: '2', name: 'تنبيه تأخر الدفع (يوم التأخر)', isActive: true,
    trigger: 'تُرسل يوم استحقاق القسط إذا لم يُسدَّد',
    title: 'تقسيط برو ⚠️',
    body: 'السلام عليكم {اسم_العميل}، قسطكم البالغ {مبلغ_القسط} ج.م استحق اليوم ولم يتم السداد. يرجى التواصل معنا أو السداد فوراً لتجنب الرسوم الإضافية.',
  },
  {
    id: '3', name: 'إيصال استلام الدفعة', isActive: true,
    trigger: 'تُرسل فور تسجيل الدفعة',
    title: 'تقسيط برو ✅',
    body: 'شكراً {اسم_العميل}! تم استلام دفعتكم {مبلغ_المدفوع} ج.م بتاريخ {تاريخ_الدفع}. المتبقي على عقدكم: {الباقي} ج.م. نقدر ثقتكم بنا.',
  },
];

const MOCK_LATE_CUSTOMERS: LateCustomer[] = [
  { id: '1', customerName: 'خالد العمري',   phone: '0501234567', amount: 800,  delayDays: 2, selected: true  },
  { id: '2', customerName: 'سارة الغامدي',  phone: '0557891234', amount: 450,  delayDays: 5, selected: true  },
  { id: '3', customerName: 'نورة السعيد',   phone: '0509871234', amount: 350,  delayDays: 1, selected: false },
  { id: '4', customerName: 'أحمد القحطاني', phone: '0544321098', amount: 600,  delayDays: 3, selected: true  },
  { id: '5', customerName: 'فهد الشمري',    phone: '0533210987', amount: 9200, delayDays: 7, selected: false },
];

const MOCK_LOG: MessageLogEntry[] = [
  { id: '1', customerName: 'خالد العمري',    type: 'تذكير قسط',       time: '9:00 ص',  status: 'sent'   },
  { id: '2', customerName: 'سارة الغامدي',   type: 'تنبيه تأخر',      time: '9:01 ص',  status: 'sent'   },
  { id: '3', customerName: 'فيصل الدوسري',   type: 'إيصال دفعة 600 ج.م', time: '10:30 ص', status: 'sent'   },
  { id: '4', customerName: 'أحمد القحطاني', type: 'تذكير قسط قادم',   time: '11:00 ص', status: 'sent'   },
  { id: '5', customerName: 'نورة السعيد',    type: 'رقم غير صحيح',    time: '11:05 ص', status: 'failed' },
];
