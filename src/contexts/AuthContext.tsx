import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/db/supabase';
import type { User } from '@supabase/supabase-js';
import type { PermissionKey, Permissions, Profile, Store } from '@/types/types';

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, custom_role:roles(*)')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('ดึงข้อมูลผู้ใช้ไม่สำเร็จ:', error);
    return null;
  }
  return data;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  store: Store | null;
  permissions: Permissions;
  loading: boolean;
  isAdmin: boolean;
  isStoreOwner: boolean;
  isSuperAdmin: boolean;
  can: (permission: PermissionKey) => boolean;
  signInWithUsername: (username: string, password: string) => Promise<{ error: Error | null; blocked?: boolean; storeClosed?: boolean }>;
  signUpWithUsername: (username: string, password: string, fullName?: string, storeId?: string, role?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** รวม permissions จาก custom_role (ถ้ามี) หรือใช้ค่า default ตาม role */
function resolvePermissions(profile: Profile | null): Permissions {
  if (!profile) return {};
  const allKeys: PermissionKey[] = [
    'view_dashboard','view_reports','view_profit','manage_products','manage_inventory',
    'manage_users','manage_settings','process_sales','void_transactions','view_transactions',
    'view_all_transactions','manage_categories','view_cost','manage_roles',
    'view_audit_log','view_fraud_alerts','issue_warnings',
  ];
  // super_admin + store_owner + admin มีสิทธิ์ทุกอย่าง
  if (['super_admin','store_owner','admin'].includes(profile.role)) {
    const all: Permissions = {};
    allKeys.forEach(k => { all[k] = true; });
    return all;
  }
  if (profile.custom_role?.permissions) return profile.custom_role.permissions;
  return { process_sales: true, view_transactions: true };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [permissions, setPermissions] = useState<Permissions>({});
  const [loading, setLoading] = useState(true);

  /** โหลดข้อมูลร้านใน background — ไม่บล็อก loading */
  const loadStore = useCallback(async (storeId: string | null | undefined) => {
    if (!storeId) { setStore(null); return; }
    const { data } = await supabase
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .maybeSingle();
    setStore(data ?? null);
  }, []);

  const applyProfile = useCallback((p: Profile | null) => {
    setProfile(p);
    setPermissions(resolvePermissions(p));
    // โหลดร้านแบบ background (ไม่ await ที่นี่)
    if (p?.store_id && p.role !== 'super_admin') {
      loadStore(p.store_id);
    } else {
      setStore(null);
    }
  }, [loadStore]);

  const refreshProfile = useCallback(async () => {
    if (!user) { applyProfile(null); return; }
    const profileData = await getProfile(user.id);
    applyProfile(profileData);
  }, [user, applyProfile]);

  useEffect(() => {
    // ใช้ onAuthStateChange เป็น single source of truth สำหรับ session ครั้งแรก
    // SIGNED_IN จะถูกจัดการใน signInWithUsername โดยตรงเพื่อป้องกัน race condition
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        // logout หรือ token หมดอายุ — ล้าง state กลับหน้า login
        setUser(null);
        applyProfile(null);
        setLoading(false);
        return;
      }
      if (event === 'INITIAL_SESSION') {
        // โหลด session ครั้งแรกตอนเปิดแอป
        if (session?.user) {
          setUser(session.user);
          const p = await getProfile(session.user.id);
          applyProfile(p);
        } else {
          setUser(null);
          applyProfile(null);
        }
        setLoading(false);
        return;
      }
      if (event === 'TOKEN_REFRESHED' && session?.user) {
        // token ต่ออายุสำเร็จ — อัปเดต user object ใหม่
        setUser(session.user);
      }
    });

    // fallback: ถ้า INITIAL_SESSION ไม่ยิงภายใน 5 วินาที ให้ยกเลิก loading
    const fallback = setTimeout(() => setLoading(false), 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallback);
    };
  }, [applyProfile]);

  const signInWithUsername = async (username: string, password: string) => {
    try {
      const email = `${username}@miaoda.com`;
      const { data: { session }, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // ดึงข้อมูลโปรไฟล์พร้อม store_id
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*, custom_role:roles(*), warning_status, role, store_id')
        .eq('username', username)
        .maybeSingle();

      // บล็อคใบแดง
      if (profileData?.warning_status === 'red_card') {
        await supabase.auth.signOut();
        setUser(null);
        applyProfile(null);
        return { error: new Error('ACCOUNT_SUSPENDED'), blocked: true };
      }

      // ตรวจสอบว่าร้านยังเปิดอยู่ (เฉพาะ non-super_admin)
      if (profileData?.role !== 'super_admin' && profileData?.store_id) {
        const { data: storeData } = await supabase
          .from('stores')
          .select('is_active')
          .eq('id', profileData.store_id)
          .maybeSingle();
        if (storeData && !storeData.is_active) {
          await supabase.auth.signOut();
          setUser(null);
          applyProfile(null);
          return { error: new Error('STORE_CLOSED'), storeClosed: true };
        }
      }

      // ✅ อัปเดต state ทันทีก่อน return — ป้องกัน race condition กับ navigate('/')
      // onAuthStateChange(SIGNED_IN) จะยิงทีหลัง แต่ค่าจะเหมือนกัน
      if (session?.user) {
        setUser(session.user);
        applyProfile(profileData as Profile | null);
        setLoading(false);
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUpWithUsername = async (
    username: string,
    password: string,
    fullName?: string,
    storeId?: string,
    role: string = 'cashier',
  ) => {
    try {
      const email = `${username}@miaoda.com`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username, full_name: fullName || username, store_id: storeId, role } },
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    await applyProfile(null);
  };

  const isAdmin = ['admin','store_owner','super_admin'].includes(profile?.role ?? '');
  const isStoreOwner = profile?.role === 'store_owner' || profile?.role === 'admin';
  const isSuperAdmin = profile?.role === 'super_admin';

  const can = useCallback((permission: PermissionKey): boolean => {
    if (isAdmin) return true;
    return permissions[permission] === true;
  }, [isAdmin, permissions]);

  return (
    <AuthContext.Provider value={{
      user, profile, store, permissions, loading,
      isAdmin, isStoreOwner, isSuperAdmin,
      can, signInWithUsername, signUpWithUsername, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Return safe defaults during HMR / Fast Refresh re-evaluation
    // instead of throwing — prevents crash when component is briefly
    // rendered outside the provider tree during hot reload.
    return {
      user: null, profile: null, store: null, permissions: {},
      loading: true, isAdmin: false, isStoreOwner: false, isSuperAdmin: false,
      can: () => false,
      signInWithUsername: async () => ({ error: new Error('No AuthProvider') }),
      signUpWithUsername: async () => ({ error: new Error('No AuthProvider') }),
      signOut: async () => {},
      refreshProfile: async () => {},
    } as AuthContextType;
  }
  return context;
}
