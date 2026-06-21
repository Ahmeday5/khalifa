import { NavSection } from '../../layouts/admin/sidebar/sidebar.component';
import { PERMISSIONS } from './permissions.const';

/**
 * Sidebar layout. Each item carries `requiredAnyPermission` so the sidebar
 * can hide entries the current user can't act on.
 *
 *   - Read-heavy items use the `*.View` permission.
 *   - Action-heavy items (forms / mutations) include both `View` AND
 *     `FullAccess` so the entry shows for view-only roles too — the
 *     specific action buttons inside each page have their own gates.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'عام',
    items: [
      {
        id: 'dashboard',
        label: 'لوحة التحكم',
        route: '/dashboard',
        icon: 'home',
        requiredAnyPermission: [PERMISSIONS.dashboardView],
      },
    ],
  },
  {
    label: 'المبيعات',
    items: [
      {
        id: 'customers',
        label: 'عملاء الأقساط',
        route: '/customers',
        badgeKey: 'overdueClients',
        badgeType: 'red',
        icon: 'users',
        requiredAnyPermission: [PERMISSIONS.clientsView],
      },
      /*{
        id: 'catalog',
        label: 'الكتالوج والطلبيات',
        route: '/catalog',
        badgeKey: 'pendingClientOrders',
        badgeType: 'amber',
        icon: 'box',
        requiredAnyPermission: [PERMISSIONS.clientsView],
      },*/
      {
        id: 'reps',
        label: 'المندوبون',
        route: '/reps',
        icon: 'user-tie',
        requiredAnyPermission: [PERMISSIONS.userManagement],
      },
      {
        id: 'rep-requests',
        label: 'طلبيات المندوبين',
        route: '/reps/requests',
        icon: 'clipboard',
        requiredAnyPermission: [PERMISSIONS.userManagement],
      },
      {
        id: 'my-account',
        label: 'كشف حسابي',
        route: '/my-account',
        icon: 'user-tie',
        // Role-exclusive: only a logged-in Representative sees this.
        requiredAnyRole: ['Representative'],
      },
    ],
  },
  {
    label: 'المشتريات',
    items: [
      {
        id: 'suppliers',
        label: 'الموردون',
        route: '/suppliers',
        icon: 'truck',
        requiredAnyPermission: [PERMISSIONS.suppliersView],
      },
      {
        id: 'invoices',
        label: 'فواتير المشتريات',
        route: '/invoices',
        icon: 'file-invoice',
        // Supplier-permission holders OR the Representative role — the two
        // gates are OR-ed by the sidebar.
        requiredAnyPermission: [PERMISSIONS.suppliersView],
        requiredAnyRole: ['Representative'],
      },
    ],
  },
  {
    label: 'المخزون',
    items: [
      {
        id: 'warehouse',
        label: 'المخازن',
        route: '/warehouse',
        icon: 'warehouse',
        requiredAnyPermission: [PERMISSIONS.suppliersView],
      },
      {
        id: 'products',
        label: 'المنتجات',
        route: '/products',
        icon: 'products',
        requiredAnyPermission: [PERMISSIONS.suppliersView],
        hideForRoles: ['Representative'],
      },
      {
        id: 'categories',
        label: 'فئات المنتجات',
        route: '/categories',
        icon: 'tag',
        requiredAnyPermission: [PERMISSIONS.suppliersView],
        hideForRoles: ['Representative'],
      },
      {
        id: 'inv-alerts',
        label: 'تنبيهات المخزون',
        route: '/warehouse/alerts',
        badgeKey: 'lowStockProducts',
        badgeType: 'amber',
        icon: 'warning',
        requiredAnyPermission: [PERMISSIONS.suppliersView],
      },
    ],
  },
  {
    label: 'المالية',
    items: [
      {
        id: 'treasury',
        label: 'الخزينة',
        route: '/treasury',
        icon: 'wallet',
        requiredAnyPermission: [PERMISSIONS.treasuryView],
      },
      {
        id: 'vouchers',
        label: 'سندات القبض والصرف',
        route: '/vouchers',
        icon: 'receipt',
        requiredAnyPermission: [PERMISSIONS.treasuryView],
      },
      {
        id: 'shareholders',
        label: 'المساهمون',
        route: '/treasury/shareholders',
        icon: 'hand-coin',
        requiredAnyPermission: [PERMISSIONS.treasuryView],
        // Owners-only — never shown to a Representative.
        hideForRoles: ['Representative'],
      },
    ],
  },
  {
    label: 'النظام',
    items: [
      {
        id: 'users',
        label: 'الصلاحيات والمستخدمون',
        route: '/users',
        icon: 'user-cog',
        requiredAnyPermission: [PERMISSIONS.userManagement],
      },
    ],
  },
];
