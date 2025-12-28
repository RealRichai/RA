/**
 * RealRiches Register Page
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

type UserRole = 'TENANT' | 'LANDLORD' | 'AGENT';

const ROLES: { value: UserRole; label: string; description: string; icon: string }[] = [
  {
    value: 'TENANT',
    label: 'Tenant',
    description: 'Find and apply for luxury rentals',
    icon: '🏠',
  },
  {
    value: 'LANDLORD',
    label: 'Landlord',
    description: 'List and manage your properties',
    icon: '🏢',
  },
  {
    value: 'AGENT',
    label: 'Agent',
    description: 'Represent clients and earn commissions',
    icon: '🤝',
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuth();
  
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<UserRole | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');

  const handleRoleSelect = (selectedRole: UserRole) => {
    setRole(selectedRole);
    setStep(2);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: role!,
      });
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="text-3xl font-display font-bold">
              <span className="text-gold-500">Real</span>
              <span className="text-teal-600">Riches</span>
            </span>
          </Link>
          <p className="mt-2 text-charcoal-600">Create your account</p>
        </div>

        {/* Step 1: Role Selection */}
        {step === 1 && (
          <div className="card p-8">
            <h2 className="text-xl font-display font-semibold text-charcoal-900 mb-6 text-center">
              I am a...
            </h2>
            
            <div className="space-y-4">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => handleRoleSelect(r.value)}
                  className="w-full p-4 rounded-lg border-2 border-charcoal-200 hover:border-teal-600 transition-colors text-left flex items-center gap-4 group"
                >
                  <span className="text-3xl">{r.icon}</span>
                  <div>
                    <p className="font-semibold text-charcoal-900 group-hover:text-teal-600 transition-colors">
                      {r.label}
                    </p>
                    <p className="text-sm text-charcoal-500">{r.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Account Details */}
        {step === 2 && (
          <div className="card p-8">
            <button
              onClick={() => setStep(1)}
              className="text-sm text-teal-600 hover:underline mb-4 flex items-center gap-1"
            >
              ← Change role
            </button>

            <div className="flex items-center gap-3 mb-6 p-3 bg-cream-50 rounded-lg">
              <span className="text-2xl">
                {ROLES.find((r) => r.value === role)?.icon}
              </span>
              <div>
                <p className="font-medium text-charcoal-900">
                  {ROLES.find((r) => r.value === role)?.label}
                </p>
                <p className="text-xs text-charcoal-500">
                  {ROLES.find((r) => r.value === role)?.description}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-charcoal-700 mb-1">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                    className="input w-full"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-charcoal-700 mb-1">
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={handleChange}
                    required
                    className="input w-full"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-charcoal-700 mb-1">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="input w-full"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-charcoal-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="input w-full"
                  placeholder="Min. 8 characters"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-charcoal-700 mb-1">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  className="input w-full"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    className="mt-1 w-4 h-4 rounded border-charcoal-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-charcoal-600">
                    I agree to the{' '}
                    <Link href="/terms" className="text-teal-600 hover:underline">
                      Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link href="/privacy" className="text-teal-600 hover:underline">
                      Privacy Policy
                    </Link>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full py-3 mt-4"
              >
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          </div>
        )}

        {/* Login Link */}
        <p className="mt-6 text-center text-charcoal-600">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-teal-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
