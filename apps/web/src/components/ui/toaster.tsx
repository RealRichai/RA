'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

const toastStore: {
  toasts: Toast[];
  listeners: Set<(toasts: Toast[]) => void>;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  subscribe: (listener: (toasts: Toast[]) => void) => () => void;
} = {
  toasts: [],
  listeners: new Set(),
  addToast(toast) {
    const id = Math.random().toString(36).slice(2);
    this.toasts = [...this.toasts, { ...toast, id }];
    this.listeners.forEach((l) => l(this.toasts));
    
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => this.removeToast(id), duration);
    }
  },
  removeToast(id) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.listeners.forEach((l) => l(this.toasts));
  },
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },
};

export function toast(props: Omit<Toast, 'id'>) {
  toastStore.addToast(props);
}

const icons = {
  default: null,
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const variants = {
  default: 'bg-white border-surface-200 text-surface-900',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  error: 'bg-red-50 border-red-200 text-red-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  info: 'bg-blue-50 border-blue-200 text-blue-900',
};

const iconColors = {
  default: 'text-surface-500',
  success: 'text-emerald-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return toastStore.subscribe(setToasts);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm">
      {toasts.map((t) => {
        const variant = t.variant ?? 'default';
        const Icon = icons[variant];

        return (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-3 p-4 rounded-xl border shadow-lg',
              'animate-fade-up',
              variants[variant]
            )}
            role="alert"
          >
            {Icon && <Icon className={cn('h-5 w-5 shrink-0', iconColors[variant])} />}
            <div className="flex-1 min-w-0">
              {t.title && <p className="font-medium">{t.title}</p>}
              {t.description && (
                <p className="text-sm opacity-90 mt-0.5">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => toastStore.removeToast(t.id)}
              className="shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
