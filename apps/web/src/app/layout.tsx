import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-playfair',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: {
    default: 'RealRiches | NYC Luxury Rentals',
    template: '%s | RealRiches',
  },
  description: 'Find your perfect NYC rental. FARE Act compliant platform serving landlords, tenants, agents, and investors across New York City and Long Island.',
  keywords: ['NYC rentals', 'New York apartments', 'FARE Act', 'luxury rentals', 'Long Island rentals'],
  authors: [{ name: 'RealRiches' }],
  creator: 'RealRiches',
  publisher: 'RealRiches',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://realriches.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'RealRiches',
    title: 'RealRiches | NYC Luxury Rentals',
    description: 'Find your perfect NYC rental. FARE Act compliant platform.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'RealRiches' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RealRiches | NYC Luxury Rentals',
    description: 'Find your perfect NYC rental. FARE Act compliant platform.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RealRiches',
  },
  formatDetection: {
    telephone: true,
    email: true,
    address: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#171717' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          <div className="pb-16 lg:pb-0">
            {children}
          </div>
          <MobileBottomNav />
        </Providers>
      </body>
    </html>
  );
}
