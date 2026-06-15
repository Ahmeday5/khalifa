import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TableColumn {
  key: string;
  label: string;
  width?: string;
  align?: 'right' | 'left' | 'center';
  cellTemplate?: TemplateRef<any>; // 🔥 مهم
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
})
export class DataTableComponent<T extends Record<string, any>> {
  columns = input.required<TableColumn[]>();
  data = input.required<T[]>();

  trackByKey = input<string>('id');
  hasActions = input<boolean>(false);
  rowClickable = input<boolean>(false);

  rowClick = output<T>();

  rowKey(row: T): unknown {
    return row[this.trackByKey()];
  }

  getCellValue(row: T, key: string): string {
    const keys = key.split('.');
    let val: any = row;

    for (const k of keys) {
      val = val?.[k];
    }

    return val ?? '—';
  }
}
