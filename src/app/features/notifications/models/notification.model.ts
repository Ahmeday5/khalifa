export type MessageStatus = 'pending' | 'sent' | 'failed';

export interface WhatsAppMessage {
  id: string;
  customerName: string;
  phone: string;
  amount: number;
  dueDate: string;
  status: MessageStatus;
  sentAt: string | null;
}

export interface MessageTemplate {
  id: string;
  name: string;
  trigger: string;
  isActive: boolean;
  title: string;
  body: string;
}

export interface LateCustomer {
  id: string;
  customerName: string;
  phone: string;
  amount: number;
  delayDays: number;
  selected: boolean;
}

export interface MessageLogEntry {
  id: string;
  customerName: string;
  type: string;
  time: string;
  status: 'sent' | 'failed';
}
