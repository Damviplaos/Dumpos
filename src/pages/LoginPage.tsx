import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, ShoppingCart, Lock, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';

const loginSchema = z.object({
  username: z.string().min(1).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6),
  agree: z.boolean().refine(v => v),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const { signInWithUsername } = useAuth();
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('store_settings').select('store_name, logo_url').maybeSingle().then(({ data }) => {
      if (data) { setStoreName(data.store_name ?? null); setLogoUrl((data as any).logo_url ?? null); }
    });
  }, []);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '', agree: false },
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    const { error, blocked, storeClosed } = await signInWithUsername(data.username, data.password);
    setIsLoading(false);
    if (error) {
      if (blocked) {
        toast.error(t('login.accountSuspended'), { duration: 6000 });
      } else if (storeClosed) {
        toast.error(t('login.storeClosed'), { duration: 6000 });
      } else {
        toast.error(t('login.invalidCredentials'));
      }
      if (!blocked && !storeClosed) {
        await supabase.from('failed_logins').insert({ username: data.username });
        await supabase.from('audit_logs').insert({
          user_id: null,
          username: data.username,
          action: 'failed_login',
          entity_type: 'auth',
          entity_id: null,
          details: {},
          severity: 'warning',
        });
        await supabase.rpc('check_brute_force', { p_username: data.username });
      }
    } else {
      toast.success(t('login.loginSuccess'));
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, username, store_id')
        .eq('username', data.username)
        .maybeSingle();
      if (profileData) {
        await Promise.all([
          supabase.from('audit_logs').insert({
            user_id: profileData.id,
            username: profileData.username,
            action: 'login',
            entity_type: 'auth',
            entity_id: null,
            details: {},
            severity: 'info',
          }),
          // บันทึกเวลาเข้างาน
          supabase.from('attendance_logs').insert({
            user_id: profileData.id,
            username: profileData.username,
            store_id: profileData.store_id ?? null,
            clock_in_at: new Date().toISOString(),
          }),
        ]);
      }
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Language switcher — top right */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          {logoUrl ? (
            <img src={logoUrl} alt="store logo" className="w-16 h-16 rounded-2xl object-contain mb-4 shadow-md bg-card border border-border" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-md">
              <ShoppingCart className="w-8 h-8 text-primary-foreground" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-foreground text-balance">
            {storeName || t('login.systemName')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">POS System</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-xl border border-border shadow-md p-6">
          <h2 className="text-lg font-semibold text-foreground mb-5">{t('login.title')}</h2>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">{t('login.username')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          {...field}
                          placeholder={t('login.usernamePlaceholder')}
                          className="pl-9"
                          autoComplete="username"
                          disabled={isLoading}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">{t('login.password')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          {...field}
                          type={showPassword ? 'text' : 'password'}
                          placeholder={t('login.passwordPlaceholder')}
                          className="pl-9 pr-10"
                          autoComplete="current-password"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="agree"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start gap-2 min-h-12">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="mt-0.5"
                          disabled={isLoading}
                        />
                      </FormControl>
                      <div className="text-sm text-muted-foreground leading-relaxed">
                        {t('login.agreePrefix')}{' '}
                        <span className="text-primary cursor-pointer hover:underline">{t('login.termsOfService')}</span>
                        {' '}{t('login.agreeAnd')}{' '}
                        <span className="text-primary cursor-pointer hover:underline">{t('login.privacyPolicy')}</span>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-11 font-semibold"
                disabled={isLoading}
              >
                {isLoading ? t('login.loggingIn') : t('login.loginButton')}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} {t('login.copyright')}
        </p>
      </div>
    </div>
  );
}
