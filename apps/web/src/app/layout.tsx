import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Inter } from 'next/font/google';
import { Providers } from '@/providers';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'RealRiches | NYC Luxury Rentals',
    template: '%s | RealRiches',
  },
  description: 'Premium NYC rental marketplace with FARE Act compliance, smart lock showings, and transparent pricing.',
  keywords: ['NYC rentals', 'luxury apartments', 'no fee apartments', 'FARE Act', 'Manhattan rentals', 'Brooklyn rentals'],
  authors: [{ name: 'RealRiches' }],
  creator: 'RealRiches',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://realriches.com',
    siteName: 'RealRiches',
    title: 'RealRiches | NYC Luxury Rentals',
    description: 'Premium NYC rental marketplace with FARE Act compliance and transparent pricing.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'RealRiches' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RealRiches | NYC Luxury Rentals',
    description: 'Premium NYC rental marketplace with FARE Act compliance.',
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0D9488',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-cream font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
