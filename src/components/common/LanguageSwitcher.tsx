import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Language {
  code: string;
  label: string;
  flag: string;
  nativeLabel: string;
}

const LANGUAGES: Language[] = [
  { code: 'th', label: 'Thai', flag: '🇹🇭', nativeLabel: 'ไทย' },
  { code: 'lo', label: 'Lao', flag: '🇱🇦', nativeLabel: 'ລາວ' },
  { code: 'en', label: 'English', flag: '🇬🇧', nativeLabel: 'EN' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳', nativeLabel: '中文' },
];

interface LanguageSwitcherProps {
  variant?: 'default' | 'compact';
  className?: string;
}

export function LanguageSwitcher({ variant = 'default', className }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const current = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0];

  const handleChange = (code: string) => {
    i18n.changeLanguage(code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === 'compact' ? 'sm' : 'default'}
          className={cn(
            'gap-1.5 font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            variant === 'compact' && 'h-8 px-2 text-xs',
            className,
          )}
          title={t('login.selectLanguage')}
        >
          <span className="text-base leading-none">{current.flag}</span>
          {variant !== 'compact' && (
            <span className="hidden sm:inline text-sm">{current.nativeLabel}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {LANGUAGES.map(lang => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className={cn(
              'gap-2 cursor-pointer',
              lang.code === i18n.language && 'bg-accent text-accent-foreground font-medium',
            )}
          >
            <span className="text-base">{lang.flag}</span>
            <span>{lang.nativeLabel}</span>
            <span className="ml-auto text-xs text-muted-foreground">{lang.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
