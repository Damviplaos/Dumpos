import type { ReactNode } from 'react';
import RouteGuard from '@/components/common/RouteGuard';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import POSPage from '@/pages/POSPage';
import ProductsPage from '@/pages/ProductsPage';
import InventoryPage from '@/pages/InventoryPage';
import ReportsPage from '@/pages/ReportsPage';
import TransactionsPage from '@/pages/TransactionsPage';
import UsersPage from '@/pages/UsersPage';
import SettingsPage from '@/pages/SettingsPage';
import RolesPage from '@/pages/RolesPage';
import FraudMonitorPage from '@/pages/FraudMonitorPage';
import SuperAdminPage from '@/pages/SuperAdminPage';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  public?: boolean;
}

export const routes: RouteConfig[] = [
  { name: 'เข้าสู่ระบบ', path: '/login', element: <LoginPage />, public: true },
  { name: 'แดชบอร์ด', path: '/dashboard', element: <RouteGuard permission="view_dashboard"><DashboardPage /></RouteGuard> },
  { name: 'หน้าขาย POS', path: '/pos', element: <RouteGuard permission="process_sales"><POSPage /></RouteGuard> },
  { name: 'สินค้า', path: '/products', element: <RouteGuard permission="manage_products"><ProductsPage /></RouteGuard> },
  { name: 'สต็อกสินค้า', path: '/inventory', element: <RouteGuard permission="manage_inventory"><InventoryPage /></RouteGuard> },
  { name: 'รายงาน', path: '/reports', element: <RouteGuard permission="view_reports"><ReportsPage /></RouteGuard> },
  { name: 'ประวัติการขาย', path: '/transactions', element: <RouteGuard permission="view_transactions"><TransactionsPage /></RouteGuard> },
  { name: 'จัดการยศ', path: '/roles', element: <RouteGuard permission="manage_roles"><RolesPage /></RouteGuard> },
  { name: 'ผู้ใช้งาน', path: '/users', element: <RouteGuard permission="manage_users"><UsersPage /></RouteGuard> },
  { name: 'ตรวจจับการโกง', path: '/fraud', element: <RouteGuard permission="view_fraud_alerts"><FraudMonitorPage /></RouteGuard> },
  { name: 'ตั้งค่าร้าน', path: '/settings', element: <RouteGuard permission="manage_settings"><SettingsPage /></RouteGuard> },
  { name: 'Super Admin', path: '/super-admin', element: <RouteGuard superAdminOnly><SuperAdminPage /></RouteGuard> },
];
