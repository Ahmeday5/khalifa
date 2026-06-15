export type ReportColor = 'gr' | 'am' | 'bl' | 'pu' | 'te' | 're';

export interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: ReportColor;
  action: string;
}
