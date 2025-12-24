'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import api, { ApiClientError } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.forgotPassword(email);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/" className="font-heading text-3xl font-semibold tracking-tight">
              RealRiches
            </Link>
          </div>

          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Check Your Email</CardTitle>
              <CardDescription>
                We&apos;ve sent a password reset link to {email}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              <p>
                Click the link in the email to reset your password.
                The link will expire in 1 hour.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Link href="/login" className="w-full">
                <Button variant="outline" className="w-full">
                  Back to Sign In
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="font-heading text-3xl font-semibold tracking-tight">
            RealRiches
          </Link>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Forgot Password?</CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send you a reset link
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button
                type="submit"
                className="w-full"
                loading={isLoading}
              >
                Send Reset Link
              </Button>
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-foreground text-center"
              >
                Back to Sign In
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
