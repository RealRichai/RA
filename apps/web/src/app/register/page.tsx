'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { ApiClientError } from '@/lib/api-client';

const ROLES = [
  { value: 'TENANT', label: 'Renter', description: 'Looking for a place to rent' },
  { value: 'LANDLORD', label: 'Landlord', description: 'Property owner or manager' },
  { value: 'AGENT', label: 'Agent', description: 'Licensed real estate agent' },
  { value: 'INVESTOR', label: 'Investor', description: 'Real estate investor' },
];

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, isLoading, isAuthenticated } = useAuth();

  const defaultRole = searchParams.get('role')?.toUpperCase() || 'TENANT';

  const [formData, setFormData] = React.useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: defaultRole,
  });
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    try {
      await register({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        role: formData.role,
      });
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="font-heading text-3xl font-semibold tracking-tight">
            RealRiches
          </Link>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Create Your Account</CardTitle>
            <CardDescription>
              Join NYC&apos;s premier rental platform
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  {error}
                </div>
              )}

              {/* Role Selection */}
              <div className="space-y-2">
                <Label>I am a...</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((role) => (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, role: role.value }))}
                      className={`p-3 text-left rounded-md border transition-colors ${
                        formData.role === role.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="font-medium text-sm">{role.label}</div>
                      <div className="text-xs text-muted-foreground">{role.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    placeholder="John"
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    placeholder="Doe"
                    value={formData.lastName}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  autoComplete="new-password"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                By creating an account, you agree to our{' '}
                <Link href="/terms" className="underline hover:text-foreground">Terms of Service</Link>
                {' '}and{' '}
                <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button
                type="submit"
                className="w-full"
                loading={isLoading}
              >
                Create Account
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="text-foreground font-medium hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
