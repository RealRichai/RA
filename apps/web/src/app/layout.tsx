import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'RealRiches | Luxury NYC Rentals',
    template: '%s | RealRiches',
  },
  description: 'Premier NYC rental platform for discerning tenants and landlords. FARE Act compliant.',
  keywords: ['NYC rentals', 'apartments', 'real estate', 'luxury rentals', 'FARE Act'],
  authors: [{ name: 'RealRiches' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'RealRiches',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
