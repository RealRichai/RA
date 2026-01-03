'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Globe } from 'lucide-react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';

import { localeFlags, localeNames, locales, type Locale } from '@/i18n/config';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  className?: string;
  variant?: 'default' | 'compact';
}

export function LanguageSwitcher({
  className,
  variant = 'default',
}: LanguageSwitcherProps) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  const handleLocaleChange = (newLocale: Locale) => {
    // Remove current locale prefix from path
    const pathWithoutLocale = pathname.replace(/^\/(en|es|fr)/, '') || '/';
    // Navigate to new locale path
    router.push(`/${newLocale}${pathWithoutLocale}`);
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className
          )}
          aria-label="Select language"
        >
          <Globe className="h-4 w-4" />
          {variant === 'default' && (
            <>
              <span>{localeFlags[locale]}</span>
              <span>{localeNames[locale]}</span>
            </>
          )}
          {variant === 'compact' && <span>{localeFlags[locale]}</span>}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
            'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2'
          )}
          sideOffset={5}
        >
          {locales.map((loc) => (
            <DropdownMenu.Item
              key={loc}
              className={cn(
                'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
                'focus:bg-accent focus:text-accent-foreground',
                'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                locale === loc && 'bg-accent/50'
              )}
              onSelect={() => handleLocaleChange(loc)}
            >
              <span>{localeFlags[loc]}</span>
              <span>{localeNames[loc]}</span>
              {locale === loc && (
                <span className="ml-auto text-xs text-muted-foreground">
                  ✓
                </span>
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
