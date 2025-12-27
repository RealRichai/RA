export const dynamic = 'force-dynamic';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Search, Shield, Zap, Users, Building2, Star, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

const stats = [
  { value: '10,000+', label: 'Active Listings' },
  { value: '50,000+', label: 'Happy Renters' },
  { value: '2,500+', label: 'Landlords' },
  { value: '500+', label: 'Licensed Agents' },
];

const features = [
  {
    icon: Shield,
    title: 'FARE Act Compliant',
    description: 'All NYC listings comply with Local Law 18 of 2024. No surprise broker fees. Application fees capped at $20.',
  },
  {
    icon: Zap,
    title: 'Self-Guided Tours',
    description: 'Tour properties on your schedule with our smart lock integration. No waiting for agents.',
  },
  {
    icon: Users,
    title: 'Verified Landlords',
    description: 'Every landlord is verified. Read reviews from previous tenants before you apply.',
  },
  {
    icon: Building2,
    title: 'Real-Time Availability',
    description: 'Listings are updated in real-time. No more inquiring about apartments that are already rented.',
  },
];

const neighborhoods = [
  { name: 'Manhattan', count: '3,200+', image: '/images/manhattan.jpg' },
  { name: 'Brooklyn', count: '2,800+', image: '/images/brooklyn.jpg' },
  { name: 'Queens', count: '1,900+', image: '/images/queens.jpg' },
  { name: 'Long Island', count: '1,500+', image: '/images/longisland.jpg' },
];

const testimonials = [
  {
    quote: "RealRiches made finding my NYC apartment so much easier. The FARE Act compliance gave me peace of mind knowing exactly what I'd pay.",
    author: 'Sarah M.',
    role: 'Tenant, Upper West Side',
    rating: 5,
  },
  {
    quote: "As a landlord, I love the streamlined application process. Quality tenants, faster turnaround, and full compliance handled automatically.",
    author: 'Michael K.',
    role: 'Landlord, Brooklyn',
    rating: 5,
  },
  {
    quote: "The investor dashboard gives me real-time insights into the NYC market. Found two great deals in my first month.",
    author: 'Jennifer L.',
    role: 'Investor',
    rating: 5,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-surface-50 to-white">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }} />
          </div>

          <div className="container-wide relative py-20 md:py-32">
            <div className="max-w-4xl mx-auto text-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-luxury-champagne/50 text-luxury-bronze text-sm font-medium mb-6">
                <CheckCircle className="h-4 w-4" />
                NYC's First FARE Act Compliant Platform
              </div>

              {/* Headline */}
              <h1 className="text-hero font-display font-bold text-surface-900 mb-6 text-balance">
                Find Your Perfect{' '}
                <span className="gradient-text">NYC Rental</span>
              </h1>

              {/* Subheadline */}
              <p className="text-xl text-surface-600 mb-10 max-w-2xl mx-auto text-balance">
                No surprise broker fees. Transparent pricing. Self-guided tours. 
                The modern way to find your next home in New York City.
              </p>

              {/* Search Bar */}
              <div className="max-w-2xl mx-auto">
                <form className="flex flex-col sm:flex-row gap-3 p-3 bg-white rounded-2xl shadow-luxury">
                  <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
                    <Input
                      type="text"
                      placeholder="Search by neighborhood, address, or ZIP..."
                      className="pl-12 border-0 bg-surface-50 h-12"
                    />
                  </div>
                  <Button size="lg" className="h-12 px-8">
                    Search Rentals
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </form>

                {/* Quick Links */}
                <div className="flex flex-wrap justify-center gap-2 mt-4 text-sm">
                  <span className="text-surface-500">Popular:</span>
                  {['Upper West Side', 'Williamsburg', 'Astoria', 'Park Slope'].map((area) => (
                    <Link
                      key={area}
                      href={`/listings?neighborhood=${encodeURIComponent(area)}`}
                      className="text-luxury-bronze hover:underline"
                    >
                      {area}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="border-t border-surface-100 bg-white/80 backdrop-blur">
            <div className="container-wide py-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {stats.map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div className="text-3xl md:text-4xl font-display font-bold text-surface-900 mb-1">
                      {stat.value}
                    </div>
                    <div className="text-sm text-surface-500">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="section bg-white">
          <div className="container-wide">
            <div className="text-center mb-16">
              <h2 className="text-headline font-display font-bold text-surface-900 mb-4">
                Why RealRiches?
              </h2>
              <p className="text-lg text-surface-600 max-w-2xl mx-auto">
                Built for NYC renters, landlords, and agents. Full compliance with 
                FARE Act and Fair Chance Housing Act built in.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="group p-6 rounded-2xl bg-surface-50 hover:bg-white hover:shadow-card-hover transition-all duration-300"
                >
                  <div className="h-12 w-12 rounded-xl bg-luxury-champagne flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <feature.icon className="h-6 w-6 text-luxury-bronze" />
                  </div>
                  <h3 className="text-lg font-semibold text-surface-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-surface-600">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Neighborhoods Section */}
        <section className="section bg-surface-50">
          <div className="container-wide">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-12">
              <div>
                <h2 className="text-headline font-display font-bold text-surface-900 mb-2">
                  Explore Neighborhoods
                </h2>
                <p className="text-surface-600">
                  Find your perfect location across NYC and Long Island
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link href="/neighborhoods">
                  View All
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {neighborhoods.map((hood) => (
                <Link
                  key={hood.name}
                  href={`/listings?borough=${encodeURIComponent(hood.name)}`}
                  className="group relative aspect-[4/3] rounded-2xl overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent z-10" />
                  <div className="absolute inset-0 bg-surface-200" />
                  {/* Placeholder for actual images */}
                  <div className="absolute inset-0 bg-gradient-to-br from-luxury-bronze/20 to-luxury-gold/20 group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 z-20">
                    <h3 className="text-xl font-display font-bold text-white mb-1">
                      {hood.name}
                    </h3>
                    <p className="text-sm text-white/80">{hood.count} listings</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="section bg-white">
          <div className="container-wide">
            <div className="text-center mb-16">
              <h2 className="text-headline font-display font-bold text-surface-900 mb-4">
                Loved by Thousands
              </h2>
              <p className="text-lg text-surface-600 max-w-2xl mx-auto">
                Join the growing community of renters, landlords, and investors 
                who trust RealRiches for their NYC real estate needs.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {testimonials.map((testimonial, index) => (
                <div
                  key={index}
                  className="p-8 rounded-2xl bg-surface-50 hover:bg-white hover:shadow-card transition-all duration-300"
                >
                  {/* Stars */}
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: testimonial.rating }).map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-luxury-gold text-luxury-gold" />
                    ))}
                  </div>
                  <blockquote className="text-surface-700 mb-6">
                    "{testimonial.quote}"
                  </blockquote>
                  <div>
                    <div className="font-semibold text-surface-900">{testimonial.author}</div>
                    <div className="text-sm text-surface-500">{testimonial.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="section bg-surface-900 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-96 h-96 bg-luxury-gold rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-luxury-bronze rounded-full blur-3xl" />
          </div>

          <div className="container-wide relative">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-headline font-display font-bold text-white mb-6">
                Ready to Find Your Next Home?
              </h2>
              <p className="text-lg text-surface-300 mb-10">
                Join thousands of New Yorkers who've found their perfect rental 
                through RealRiches. No broker fees for tenants. Ever.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="xl" asChild>
                  <Link href="/listings">
                    Browse Listings
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="xl" variant="outline" className="border-white/20 text-white hover:bg-white/10" asChild>
                  <Link href="/landlords">List Your Property</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
