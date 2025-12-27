'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, ArrowRight, Users, Home, Building2, TrendingUp, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/hooks';
import { cn, isValidEmail } from '@/lib/utils';

function LoginContent() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  const { login, isLoggingIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!isValidEmail(email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      login({ email, password });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link href="/" className="flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-lg bg-gradient-luxury flex items-center justify-center">
              <span className="text-white font-bold">RR</span>
            </div>
            <span className="font-display text-2xl font-bold text-surface-900">RealRiches</span>
          </Link>

          <Card className="border-0 shadow-luxury">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl">Welcome back</CardTitle>
              <CardDescription>Sign in to your account to continue</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label="Email" error={errors.email} required>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-12"
                      error={errors.email}
                    />
                  </div>
                </FormField>

                <FormField label="Password" error={errors.password} required>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-12 pr-12"
                      error={errors.password}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </FormField>

                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-sm text-luxury-bronze hover:underline">
                    Forgot password?
                  </Link>
                </div>

                <Button type="submit" size="lg" className="w-full" loading={isLoggingIn}>
                  Sign In
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-surface-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-4 text-surface-500">Or continue with</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" type="button" className="w-full">
                  <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </Button>
                <Button variant="outline" type="button" className="w-full">
                  <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z"/>
                  </svg>
                  Apple
                </Button>
              </div>

              {/* Demo Login Section */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-surface-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-4 text-surface-500">Quick Demo Access</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full text-sm"
                    onClick={() => login({ email: 'demo-tenant@realriches.com', password: 'demo1234' })}
                    disabled={isLoggingIn}
                  >
                    <Home className="h-4 w-4 mr-2" />
                    Demo as Tenant
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full text-sm"
                    onClick={() => login({ email: 'demo-landlord@realriches.com', password: 'demo1234' })}
                    disabled={isLoggingIn}
                  >
                    <Building2 className="h-4 w-4 mr-2" />
                    Demo as Landlord
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full text-sm"
                    onClick={() => login({ email: 'demo-agent@realriches.com', password: 'demo1234' })}
                    disabled={isLoggingIn}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Agent
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full text-sm"
                    onClick={() => login({ email: 'demo-investor@realriches.com', password: 'demo1234' })}
                    disabled={isLoggingIn}
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Investor
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full text-sm"
                    onClick={() => login({ email: 'demo-admin@realriches.com', password: 'demo1234' })}
                    disabled={isLoggingIn}
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Admin
                  </Button>
                </div>
              </div>

              <p className="text-center text-sm text-surface-500 mt-6">
                Don't have an account?{' '}
                <Link href="/register" className="text-luxury-bronze font-medium hover:underline">
                  Sign up
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right side - Image/Branding */}
      <div className="hidden lg:flex flex-1 bg-surface-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-luxury-bronze/20 to-luxury-gold/10" />
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="max-w-lg text-center">
            <h2 className="text-4xl font-display font-bold text-white mb-6">
              Your Dream NYC Rental Awaits
            </h2>
            <p className="text-lg text-surface-300 mb-8">
              Join thousands of New Yorkers who've found their perfect home through RealRiches. FARE Act compliant. No hidden fees.
            </p>
            <div className="flex justify-center gap-8 text-center">
              <div>
                <div className="text-3xl font-display font-bold text-luxury-gold">10K+</div>
                <div className="text-sm text-surface-400">Active Listings</div>
              </div>
              <div>
                <div className="text-3xl font-display font-bold text-luxury-gold">50K+</div>
                <div className="text-sm text-surface-400">Happy Renters</div>
              </div>
              <div>
                <div className="text-3xl font-display font-bold text-luxury-gold">$0</div>
                <div className="text-sm text-surface-400">Broker Fees</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
