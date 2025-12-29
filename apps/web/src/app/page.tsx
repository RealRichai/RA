import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Building2, Shield, Sparkles, TrendingUp } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">RealRiches</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/landlords" className="text-sm font-medium hover:text-primary">
              For Landlords
            </Link>
            <Link href="/agents" className="text-sm font-medium hover:text-primary">
              For Agents
            </Link>
            <Link href="/investors" className="text-sm font-medium hover:text-primary">
              For Investors
            </Link>
            <Link href="/commercial" className="text-sm font-medium hover:text-primary">
              Commercial
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 flex items-center">
        <div className="container py-24">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-5xl font-bold tracking-tight mb-6">
              AI-Powered Real Estate
              <span className="text-primary"> Management</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Streamline property management, automate compliance, and maximize returns
              with the most advanced real estate platform.
            </p>
            <div className="flex gap-4 justify-center">
              <Link href="/register">
                <Button size="lg">Start Free Trial</Button>
              </Link>
              <Link href="/demo">
                <Button size="lg" variant="outline">
                  Watch Demo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-muted/50">
        <div className="container">
          <h2 className="text-3xl font-bold text-center mb-12">
            Everything You Need to Succeed
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={<Shield className="h-10 w-10" />}
              title="Compliance Autopilot"
              description="Automatic FARE Act, Good Cause, and rent stabilization compliance checking."
            />
            <FeatureCard
              icon={<Sparkles className="h-10 w-10" />}
              title="AI Leasing Assistant"
              description="24/7 AI-powered leasing with high-fidelity context transfer."
            />
            <FeatureCard
              icon={<TrendingUp className="h-10 w-10" />}
              title="Smart Analytics"
              description="Real-time portfolio insights and market intelligence."
            />
            <FeatureCard
              icon={<Building2 className="h-10 w-10" />}
              title="Property Management"
              description="God View dashboard with AI maintenance triage and vendor management."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="container text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Portfolio?</h2>
          <p className="text-xl text-muted-foreground mb-8">
            Join thousands of property owners using RealRiches.
          </p>
          <Link href="/register">
            <Button size="lg">Get Started for Free</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="h-6 w-6" />
                <span className="font-bold">RealRiches</span>
              </div>
              <p className="text-sm text-muted-foreground">
                AI-powered real estate platform for modern property management.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/features">Features</Link></li>
                <li><Link href="/pricing">Pricing</Link></li>
                <li><Link href="/integrations">Integrations</Link></li>
                <li><Link href="/api">API</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Resources</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/docs">Documentation</Link></li>
                <li><Link href="/blog">Blog</Link></li>
                <li><Link href="/support">Support</Link></li>
                <li><Link href="/compliance">Compliance Guide</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/about">About</Link></li>
                <li><Link href="/careers">Careers</Link></li>
                <li><Link href="/privacy">Privacy</Link></li>
                <li><Link href="/terms">Terms</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} RealRiches. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-lg border bg-card">
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
