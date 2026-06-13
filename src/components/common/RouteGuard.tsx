import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layouts/MainLayout';
import type { PermissionKey } from '@/types/types';

interface RouteGuardProps {
  children: React.ReactNode;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  permission?: PermissionKey;
}

export default function RouteGuard({ children, adminOnly = false, superAdminOnly = false, permission }: RouteGuardProps) {
  const { user, profile, loading, can } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // ตรวจสอบ red_card — บัญชีถูกระงับ
  if (profile.warning_status === 'red_card') {
    return <Navigate to="/login" replace />;
  }

  if (superAdminOnly && profile.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  if (adminOnly && profile.role !== 'admin' && profile.role !== 'super_admin') {
    return <Navigate to="/pos" replace />;
  }

  if (permission && !can(permission)) {
    return <Navigate to="/pos" replace />;
  }

  return <MainLayout>{children}</MainLayout>;
}

