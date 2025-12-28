'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'react-hot-toast';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#36454F',
              color: '#FFFDFB',
              borderRadius: '0.75rem',
              padding: '1rem',
            },
            success: {
              iconTheme: { primary: '#0D9488', secondary: '#FFFDFB' },
            },
            error: {
              iconTheme: { primary: '#EF4444', secondary: '#FFFDFB' },
            },
          }}
        />
        </QueryClientProvider>
    </SessionProvider>
  );
}
