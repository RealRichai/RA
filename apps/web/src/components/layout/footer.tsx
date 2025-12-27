import Link from 'next/link';
import { Building2, Mail, Phone, MapPin } from 'lucide-react';

const footerLinks = {
  'For Renters': [
    { href: '/listings', label: 'Browse Listings' },
    { href: '/neighborhoods', label: 'Neighborhoods' },
    { href: '/fare-act', label: 'FARE Act Guide' },
    { href: '/renter-resources', label: 'Renter Resources' },
  ],
  'For Landlords': [
    { href: '/landlords', label: 'List Your Property' },
    { href: '/landlord-resources', label: 'Landlord Resources' },
    { href: '/compliance', label: 'Compliance Guide' },
    { href: '/pricing', label: 'Pricing' },
  ],
  'For Agents': [
    { href: '/agents', label: 'Join as Agent' },
    { href: '/agent-tools', label: 'Agent Tools' },
    { href: '/lead-marketplace', label: 'Lead Marketplace' },
    { href: '/agent-resources', label: 'Agent Resources' },
  ],
  Company: [
    { href: '/about', label: 'About Us' },
    { href: '/careers', label: 'Careers' },
    { href: '/press', label: 'Press' },
    { href: '/contact', label: 'Contact' },
  ],
};

export function Footer() {
  return (
    <footer className="bg-surface-900 text-surface-300">
      <div className="container-wide py-16">
        {/* Main Footer Content */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          {/* Brand Column */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="h-10 w-10 rounded-lg bg-gradient-luxury flex items-center justify-center">
                <span className="text-white font-bold">RR</span>
              </div>
              <span className="font-display text-2xl font-bold text-white">
                RealRiches
              </span>
            </Link>
            <p className="text-sm text-surface-400 mb-6 max-w-xs">
              NYC's premier rental platform. FARE Act compliant. Serving landlords, tenants, agents, and investors.
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-luxury-gold" />
                <span>New York City & Long Island</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-luxury-gold" />
                <a href="mailto:hello@realriches.com" className="hover:text-white transition-colors">
                  hello@realriches.com
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-luxury-gold" />
                <a href="tel:+12125551234" className="hover:text-white transition-colors">
                  (212) 555-1234
                </a>
              </div>
            </div>
          </div>

          {/* Link Columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h3 className="font-semibold text-white mb-4">{title}</h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-surface-400 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Compliance & Trust Badges */}
        <div className="border-t border-surface-700 pt-8 mb-8">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-surface-400">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg className="h-4 w-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span>FARE Act Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg className="h-4 w-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span>Fair Chance Housing Act Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                <svg className="h-4 w-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span>256-bit Encryption</span>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-surface-700 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-surface-500">
            © {new Date().getFullYear()} RealRiches. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm">
            <Link href="/privacy" className="text-surface-400 hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-surface-400 hover:text-white transition-colors">
              Terms of Service
            </Link>
            <Link href="/accessibility" className="text-surface-400 hover:text-white transition-colors">
              Accessibility
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
