import Link from 'next/link';
import { SearchBar } from '@/components/forms/SearchBar';
import { FeatureCard } from '@/components/cards/FeatureCard';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

const stats = [
  { label: 'Active Listings', value: '2,500+' },
  { label: 'Markets', value: '11' },
  { label: 'Happy Tenants', value: '15,000+' },
  { label: 'Avg. Savings', value: '$2,400' },
];

const features = [
  {
    title: 'FARE Act Compliant',
    description: 'Transparent pricing with capped application fees ($20 max) and clear broker fee disclosure.',
    icon: 'shield-check',
  },
  {
    title: 'Fair Chance Housing',
    description: 'FCHA-compliant applications ensuring fair assessment for all applicants under Article 23-A.',
    icon: 'scale',
  },
  {
    title: 'Smart Lock Showings',
    description: 'Self-guided tours with secure, time-limited access codes. View properties on your schedule.',
    icon: 'key',
  },
  {
    title: 'Instant Applications',
    description: 'Apply in minutes with secure document upload and real-time status tracking.',
    icon: 'document-check',
  },
  {
    title: 'Digital Leases',
    description: 'E-sign your lease from anywhere with DocuSign integration and secure storage.',
    icon: 'pencil-square',
  },
  {
    title: 'Secure Payments',
    description: 'Pay rent via card or bank transfer with Stripe-powered security and 1-click convenience.',
    icon: 'credit-card',
  },
];

const markets = [
  { name: 'Manhattan', count: 850 },
  { name: 'Brooklyn', count: 620 },
  { name: 'Queens', count: 480 },
  { name: 'Bronx', count: 280 },
  { name: 'Staten Island', count: 120 },
  { name: 'Nassau County', count: 95 },
];

export default function HomePage() {
  return (
    <>
      <Header />
      
      <main>
        {/* Hero Section */}
        <section className="relative min-h-[85vh] flex items-center bg-gradient-to-br from-charcoal via-charcoal/95 to-primary/20">
          <div className="absolute inset-0 bg-[url('/hero-pattern.svg')] opacity-5" />
          <div className="container-wide relative z-10 py-20">
            <div className="max-w-3xl">
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif text-white mb-6 animate-fade-in">
                Find Your Perfect
                <span className="text-gradient block">NYC Home</span>
              </h1>
              <p className="text-xl md:text-2xl text-white/80 mb-10 animate-slide-up">
                Premium rentals across 11 NYC markets with transparent pricing, 
                FARE Act compliance, and smart lock showings.
              </p>
              
              <div className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
                <SearchBar />
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12 animate-fade-in" style={{ animationDelay: '0.4s' }}>
                {stats.map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div className="text-3xl md:text-4xl font-serif text-secondary mb-1">
                      {stat.value}
                    </div>
                    <div className="text-sm text-white/60">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Markets Section */}
        <section className="section bg-cream">
          <div className="container-wide">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-serif text-charcoal mb-4">
                Explore NYC Markets
              </h2>
              <p className="text-lg text-charcoal/70 max-w-2xl mx-auto">
                From Manhattan penthouses to Brooklyn brownstones, find your ideal neighborhood.
              </p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {markets.map((market) => (
                <Link
                  key={market.name}
                  href={`/listings?market=${market.name.toLowerCase().replace(' ', '-')}`}
                  className="card-hover p-6 text-center group"
                >
                  <h3 className="font-serif text-lg text-charcoal group-hover:text-primary transition-colors">
                    {market.name}
                  </h3>
                  <p className="text-sm text-charcoal/60 mt-1">
                    {market.count} listings
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="section bg-white">
          <div className="container-wide">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-serif text-charcoal mb-4">
                Why Choose RealRiches
              </h2>
              <p className="text-lg text-charcoal/70 max-w-2xl mx-auto">
                Built for NYC's new rental landscape with full regulatory compliance and modern convenience.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature) => (
                <FeatureCard key={feature.title} {...feature} />
              ))}
            </div>
          </div>
        </section>

        {/* FARE Act Banner */}
        <section className="py-12 bg-primary">
          <div className="container-wide">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-white">
                <h3 className="text-2xl font-serif mb-2">FARE Act Compliant</h3>
                <p className="text-white/80">
                  All listings follow NYC's FARE Act (effective June 2025) with capped fees and transparent pricing.
                </p>
              </div>
              <Link href="/fare-act" className="btn-secondary whitespace-nowrap">
                Learn More
              </Link>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="section bg-cream">
          <div className="container-narrow text-center">
            <h2 className="text-3xl md:text-4xl font-serif text-charcoal mb-6">
              Ready to Find Your Home?
            </h2>
            <p className="text-lg text-charcoal/70 mb-8 max-w-xl mx-auto">
              Join thousands of New Yorkers who found their perfect apartment through RealRiches.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/listings" className="btn-primary">
                Browse Listings
              </Link>
              <Link href="/auth/register" className="btn-outline">
                Create Account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
