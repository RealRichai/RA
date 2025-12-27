'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Mail, Lock, User, Phone, ArrowRight, Building2, Users, Briefcase, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/hooks';
import { cn, isValidEmail, isValidPhone } from '@/lib/utils';

const roles = [
  { value: 'TENANT', label: 'Renter', description: 'Looking for my next home', icon: User },
  { value: 'LANDLORD', label: 'Landlord', description: 'List and manage properties', icon: Building2 },
  { value: 'AGENT', label: 'Agent', description: 'Help clients find homes', icon: Users },
  { value: 'INVESTOR', label: 'Investor', description: 'Find investment opportunities', icon: TrendingUp },
] as const;

type RoleValue = typeof roles[number]['value'];

export default function RegisterPage() {
  const { register, isRegistering } = useAuth();
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  
  const [role, setRole] = useState<RoleValue>('TENANT');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateStep1 = (): boolean => {
    return !!role;
  };

  const validateStep2 = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!firstName.trim()) newErrors.firstName = 'First name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!isValidEmail(email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (phone && !isValidPhone(phone)) {
      newErrors.phone = 'Please enter a valid phone number';
    }
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 12) {
      newErrors.password = 'Password must be at least 12 characters';
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password = 'Password must contain an uppercase letter';
    } else if (!/[a-z]/.test(password)) {
      newErrors.password = 'Password must contain a lowercase letter';
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = 'Password must contain a number';
    }
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    if (!agreedToTerms) {
      newErrors.terms = 'You must agree to the terms';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateStep2()) {
      register({
        email,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        phone: phone || undefined,
      });
    }
  };

  const getPasswordStrength = (): { score: number; label: string; color: string } => {
    let score = 0;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500' };
    if (score <= 4) return { score, label: 'Medium', color: 'bg-amber-500' };
    return { score, label: 'Strong', color: 'bg-emerald-500' };
  };

  const strength = getPasswordStrength();

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">
          <Link href="/" className="flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-lg bg-gradient-luxury flex items-center justify-center">
              <span className="text-white font-bold">RR</span>
            </div>
            <span className="font-display text-2xl font-bold text-surface-900">RealRiches</span>
          </Link>

          <Card className="border-0 shadow-luxury">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl">Create your account</CardTitle>
              <CardDescription>
                {step === 1 ? 'How will you be using RealRiches?' : 'Enter your details to get started'}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {/* Progress indicator */}
              <div className="flex items-center gap-2 mb-8">
                <div className={cn('flex-1 h-1 rounded-full', step >= 1 ? 'bg-luxury-gold' : 'bg-surface-200')} />
                <div className={cn('flex-1 h-1 rounded-full', step >= 2 ? 'bg-luxury-gold' : 'bg-surface-200')} />
              </div>

              {step === 1 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {roles.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRole(r.value)}
                        className={cn(
                          'p-4 rounded-xl border-2 text-left transition-all',
                          role === r.value
                            ? 'border-luxury-gold bg-luxury-champagne/20'
                            : 'border-surface-200 hover:border-surface-300'
                        )}
                      >
                        <r.icon className={cn('h-6 w-6 mb-2', role === r.value ? 'text-luxury-bronze' : 'text-surface-400')} />
                        <div className="font-medium text-surface-900">{r.label}</div>
                        <div className="text-xs text-surface-500">{r.description}</div>
                      </button>
                    ))}
                  </div>
                  <Button size="lg" className="w-full mt-6" onClick={handleNext}>
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="First Name" error={errors.firstName} required>
                      <Input
                        placeholder="John"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        error={errors.firstName}
                      />
                    </FormField>
                    <FormField label="Last Name" error={errors.lastName} required>
                      <Input
                        placeholder="Doe"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        error={errors.lastName}
                      />
                    </FormField>
                  </div>

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

                  <FormField label="Phone (optional)" error={errors.phone}>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
                      <Input
                        type="tel"
                        placeholder="(212) 555-1234"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-12"
                        error={errors.phone}
                      />
                    </div>
                  </FormField>

                  <FormField label="Password" error={errors.password} required>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••••••"
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
                    {password && (
                      <div className="mt-2">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex-1 h-1.5 bg-surface-200 rounded-full overflow-hidden">
                            <div className={cn('h-full transition-all', strength.color)} style={{ width: `${(strength.score / 6) * 100}%` }} />
                          </div>
                          <span className="text-xs text-surface-500">{strength.label}</span>
                        </div>
                        <p className="text-xs text-surface-500">Min 12 characters with uppercase, lowercase, and number</p>
                      </div>
                    )}
                  </FormField>

                  <FormField label="Confirm Password" error={errors.confirmPassword} required>
                    <Input
                      type="password"
                      placeholder="••••••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      error={errors.confirmPassword}
                    />
                  </FormField>

                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="terms"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-surface-300 text-luxury-bronze focus:ring-luxury-gold"
                    />
                    <label htmlFor="terms" className="text-sm text-surface-600">
                      I agree to the{' '}
                      <Link href="/terms" className="text-luxury-bronze hover:underline">Terms of Service</Link>
                      {' '}and{' '}
                      <Link href="/privacy" className="text-luxury-bronze hover:underline">Privacy Policy</Link>
                    </label>
                  </div>
                  {errors.terms && <p className="text-sm text-red-500">{errors.terms}</p>}

                  <div className="flex gap-3 pt-2">
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>Back</Button>
                    <Button type="submit" className="flex-1" loading={isRegistering}>
                      Create Account
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </form>
              )}

              <p className="text-center text-sm text-surface-500 mt-6">
                Already have an account?{' '}
                <Link href="/login" className="text-luxury-bronze font-medium hover:underline">Sign in</Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 bg-surface-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-luxury-bronze/20 to-luxury-gold/10" />
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="max-w-lg text-center">
            <h2 className="text-4xl font-display font-bold text-white mb-6">
              {role === 'TENANT' && 'Find Your Perfect Home'}
              {role === 'LANDLORD' && 'List Your Properties'}
              {role === 'AGENT' && 'Grow Your Business'}
              {role === 'INVESTOR' && 'Discover Opportunities'}
            </h2>
            <p className="text-lg text-surface-300">
              {role === 'TENANT' && 'Browse thousands of FARE Act compliant listings across NYC. No broker fees, transparent pricing.'}
              {role === 'LANDLORD' && 'Reach quality tenants, manage applications, and stay compliant with NYC regulations automatically.'}
              {role === 'AGENT' && 'Access our lead marketplace, manage showings, and close more deals with our platform.'}
              {role === 'INVESTOR' && 'Find hidden gems, analyze deals, and build your NYC real estate portfolio.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
