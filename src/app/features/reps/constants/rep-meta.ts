import { BadgeType } from '../../../shared/components/badge/badge.component';
import {
  RepresentativePermission,
  RepresentativeStatus,
} from '../models/rep.model';

/* ── Status ─────────────────────────────────────────────────────── */

export const REP_STATUS_OPTIONS: ReadonlyArray<{
  value: RepresentativeStatus;
  label: string;
}> = [
  { value: 'Active', label: 'نشط' },
  { value: 'NotActive', label: 'غير نشط' },
];

export const REP_STATUS_LABELS: Readonly<Record<RepresentativeStatus, string>> =
  {
    Active: 'نشط',
    NotActive: 'غير نشط',
  };

export const REP_STATUS_BADGE: Readonly<
  Record<RepresentativeStatus, BadgeType>
> = {
  Active: 'ok',
  NotActive: 'bad',
};

/* ── Permissions ────────────────────────────────────────────────── */

export const REP_PERMISSION_OPTIONS: ReadonlyArray<{
  value: RepresentativePermission;
  label: string;
}> = [
  { value: 'SalesAndCollection', label: 'مبيعات وتحصيل' },
  { value: 'SalesOnly', label: 'مبيعات فقط' },
  { value: 'CollectionOnly', label: 'تحصيل فقط' },
];

export const REP_PERMISSION_LABELS: Readonly<
  Record<RepresentativePermission, string>
> = {
  SalesAndCollection: 'مبيعات وتحصيل',
  SalesOnly: 'مبيعات فقط',
  CollectionOnly: 'تحصيل فقط',
};

export const REP_PERMISSION_BADGE: Readonly<
  Record<RepresentativePermission, BadgeType>
> = {
  SalesAndCollection: 'teal',
  SalesOnly: 'info',
  CollectionOnly: 'purple',
};
