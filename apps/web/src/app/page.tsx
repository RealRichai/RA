import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="border-b border-border/40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-heading text-2xl font-semibold tracking-tight">
            RealRiches
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/listings" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Browse Listings
            </Link>
            <Link href="/agents" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Find an Agent
            </Link>
            <Link href="/about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              About
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Content */}
      <section className="py-24 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <h1 className="font-heading text-4xl md:text-6xl font-semibold tracking-tight max-w-4xl mx-auto leading-tight">
            Find Your Perfect
            <span className="block text-[#0F3B3A] dark:text-[#C6A76A]"> NYC Home</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover exceptional rentals across New York City and Long Island.
            Transparent fees. FARE Act compliant. Luxury service.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/listings">
              <Button size="lg" className="min-w-[180px]">
                Browse Rentals
              </Button>
            </Link>
            <Link href="/register?role=landlord">
              <Button size="lg" variant="outline" className="min-w-[180px]">
                List Your Property
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="font-heading text-3xl font-semibold text-center mb-12">
            Why RealRiches?
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <FeatureCard
              title="FARE Act Compliant"
              description="Full fee transparency from day one. Application fees capped at $20. No hidden charges."
            />
            <FeatureCard
              title="Fair Housing First"
              description="Fair Chance Housing Act compliant. We believe everyone deserves a fair opportunity."
            />
            <FeatureCard
              title="Verified Listings"
              description="Every listing verified by our team. Real photos. Accurate information. No bait and switch."
            />
          </div>
        </div>
      </section>

      {/* Market Stats */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <StatCard number="5,000+" label="Active Listings" />
            <StatCard number="12,000+" label="Happy Tenants" />
            <StatCard number="500+" label="Trusted Agents" />
            <StatCard number="11" label="Markets Served" />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-heading text-3xl font-semibold mb-4">
            Ready to Find Your Home?
          </h2>
          <p className="text-lg opacity-90 mb-8 max-w-xl mx-auto">
            Join thousands of New Yorkers who found their perfect apartment through RealRiches.
          </p>
          <Link href="/register">
            <Button
              size="lg"
              variant="secondary"
              className="min-w-[200px]"
            >
              Create Free Account
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <span className="font-heading text-xl font-semibold">RealRiches</span>
              <p className="mt-3 text-sm text-muted-foreground">
                NYC&apos;s premier rental platform for the modern renter.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-3">For Renters</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/listings" className="hover:text-foreground transition-colors">Browse Listings</Link></li>
                <li><Link href="/agents" className="hover:text-foreground transition-colors">Find an Agent</Link></li>
                <li><Link href="/resources" className="hover:text-foreground transition-colors">Renter Resources</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-3">For Landlords</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/register?role=landlord" className="hover:text-foreground transition-colors">List Property</Link></li>
                <li><Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link></li>
                <li><Link href="/landlord-resources" className="hover:text-foreground transition-colors">Landlord Resources</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/about" className="hover:text-foreground transition-colors">About Us</Link></li>
                <li><Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link></li>
                <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} RealRiches. All rights reserved.
            </p>
            <p className="text-sm text-muted-foreground">
              FARE Act Compliant | Fair Housing Certified
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 rounded-lg border border-border bg-card">
      <h3 className="font-heading text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <div className="font-heading text-4xl font-bold text-[#0F3B3A] dark:text-[#C6A76A]">
        {number}
      </div>
      <div className="mt-1 text-muted-foreground">{label}</div>
    </div>
  );
}
