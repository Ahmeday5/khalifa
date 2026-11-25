import { NavSection } from '../../layouts/admin/sidebar/sidebar.component';
import { ACCESS_RULES } from './access-rules.const';

/**
 * Sidebar layout. Each item declares the same `ACCESS_RULES` entry its route
 * guard uses, so an entry is visible exactly when its page is reachable —
 * never "shown in the menu, then 403 / redirected".
 *
 * Items without `access` are visible to every authenticated user.
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
        access: ACCESS_RULES.dashboard,
      },
      {
        id: 'push-notifications',
        label: 'الإشعارات',
        route: '/push-notifications',
        badgeKey: 'unreadNotifications',
        badgeType: 'red',
        icon: 'bell',
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
        access: ACCESS_RULES.clients,
      },
      {
        id: 'pending-down-payments',
        label: 'مقدمات معلقة',
        route: '/customers/pending-down-payments',
        badgeKey: 'pendingDownPayments',
        badgeType: 'amber',
        icon: 'wallet',
        access: ACCESS_RULES.clients,
      },
      /*{
        id: 'catalog',
        label: 'الكتالوج والطلبيات',
        route: '/catalog',
        badgeKey: 'pendingClientOrders',
        badgeType: 'amber',
        icon: 'box',
        access: ACCESS_RULES.clients,
      },*/
      {
        id: 'reps',
        label: 'المندوبون',
        route: '/reps',
        icon: 'user-tie',
        access: ACCESS_RULES.userManagement,
      },
      {
        id: 'rep-requests',
        label: 'طلبيات المندوبين',
        route: '/reps/requests',
        icon: 'clipboard',
        access: ACCESS_RULES.userManagement,
      },
      {
        id: 'my-account',
        label: 'كشف حسابي',
        route: '/my-account',
        icon: 'user-tie',
        access: ACCESS_RULES.representativeSelfService,
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
        access: ACCESS_RULES.suppliers,
      },
      {
        id: 'invoices',
        label: 'فواتير المشتريات',
        route: '/invoices',
        icon: 'file-invoice',
        access: ACCESS_RULES.purchaseInvoices,
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
        access: ACCESS_RULES.inventory,
      },
      {
        id: 'products',
        label: 'المنتجات',
        route: '/products',
        icon: 'products',
        access: ACCESS_RULES.inventory,
      },
      {
        id: 'categories',
        label: 'فئات المنتجات',
        route: '/categories',
        icon: 'tag',
        access: ACCESS_RULES.inventory,
      },
      {
        id: 'inv-alerts',
        label: 'تنبيهات المخزون',
        route: '/warehouse/alerts',
        badgeKey: 'lowStockProducts',
        badgeType: 'amber',
        icon: 'warning',
        access: ACCESS_RULES.inventory,
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
        access: ACCESS_RULES.treasury,
      },
      {
        id: 'vouchers',
        label: 'سندات القبض والصرف',
        route: '/vouchers',
        icon: 'receipt',
        access: ACCESS_RULES.vouchers,
      },
      {
        id: 'shareholders',
        label: 'المساهمون',
        route: '/treasury/shareholders',
        icon: 'hand-coin',
        access: ACCESS_RULES.shareholders,
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
        access: ACCESS_RULES.userManagement,
      },
    ],
  },
];
