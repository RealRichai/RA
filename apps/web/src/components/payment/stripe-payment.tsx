'use client';

import { useState, useEffect } from 'react';
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Loader2, CreditCard, Shield, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

interface PaymentFormProps {
  amount: number;
  description: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
}

function CheckoutForm({ amount, description, onSuccess, onError }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment/success`,
        },
        redirect: 'if_required',
      });

      if (error) {
        onError(error.message || 'Payment failed');
        toast({ title: 'Payment failed', description: error.message, variant: 'error' });
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess(paymentIntent.id);
        toast({ title: 'Payment successful', variant: 'success' });
      }
    } catch (err) {
      onError('An unexpected error occurred');
      toast({ title: 'Payment error', description: 'Please try again', variant: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="p-4 bg-surface-50 rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-surface-600">{description}</span>
          <span className="text-2xl font-display font-bold text-surface-900">
            {formatCurrency(amount / 100)}
          </span>
        </div>
      </div>

      <div className="border border-surface-200 rounded-xl p-4">
        <PaymentElement
          onReady={() => setIsReady(true)}
          options={{
            layout: 'tabs',
            business: { name: 'RealRiches' },
          }}
        />
      </div>

      <div className="flex items-center gap-2 text-sm text-surface-500">
        <Shield className="h-4 w-4" />
        <span>Your payment information is encrypted and secure</span>
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!stripe || !elements || !isReady || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4 mr-2" />
            Pay {formatCurrency(amount / 100)}
          </>
        )}
      </Button>
    </form>
  );
}

interface StripePaymentProps {
  clientSecret: string;
  amount: number;
  description: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
}

export function StripePayment({
  clientSecret,
  amount,
  description,
  onSuccess,
  onError,
}: StripePaymentProps) {
  const options = {
    clientSecret,
    appearance: {
      theme: 'stripe' as const,
      variables: {
        colorPrimary: '#8b6914',
        colorBackground: '#ffffff',
        colorText: '#171717',
        colorDanger: '#dc2626',
        fontFamily: 'Inter, system-ui, sans-serif',
        borderRadius: '12px',
        spacingUnit: '4px',
      },
      rules: {
        '.Input': {
          border: '1px solid #e5e5e5',
          boxShadow: 'none',
        },
        '.Input:focus': {
          border: '1px solid #c9a962',
          boxShadow: '0 0 0 3px rgba(201, 169, 98, 0.1)',
        },
        '.Label': {
          fontWeight: '500',
          marginBottom: '8px',
        },
        '.Tab': {
          border: '1px solid #e5e5e5',
        },
        '.Tab--selected': {
          borderColor: '#c9a962',
          backgroundColor: 'rgba(201, 169, 98, 0.05)',
        },
      },
    },
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      <CheckoutForm
        amount={amount}
        description={description}
        onSuccess={onSuccess}
        onError={onError}
      />
    </Elements>
  );
}

interface PaymentSuccessProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
}

export function PaymentSuccess({
  title = 'Payment Successful',
  message = 'Your payment has been processed successfully.',
  actionLabel = 'Continue',
  actionHref = '/dashboard',
}: PaymentSuccessProps) {
  return (
    <Card className="max-w-md mx-auto text-center">
      <CardContent className="pt-8 pb-6">
        <div className="h-16 w-16 mx-auto mb-6 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle className="h-8 w-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-display font-bold text-surface-900 mb-2">{title}</h2>
        <p className="text-surface-500 mb-6">{message}</p>
        <Button asChild>
          <a href={actionHref}>{actionLabel}</a>
        </Button>
      </CardContent>
    </Card>
  );
}

interface ApplicationFeePaymentProps {
  applicationId: string;
  listingTitle: string;
  feeAmount: number;
  onSuccess: () => void;
}

export function ApplicationFeePayment({
  applicationId,
  listingTitle,
  feeAmount,
  onSuccess,
}: ApplicationFeePaymentProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function createPaymentIntent() {
      try {
        const response = await fetch(`/api/v1/applications/${applicationId}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'application_fee' }),
        });

        if (!response.ok) {
          throw new Error('Failed to create payment intent');
        }

        const data = await response.json();
        setClientSecret(data.data.clientSecret);
      } catch (err) {
        setError('Failed to initialize payment. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }

    createPaymentIntent();
  }, [applicationId]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-luxury-bronze" />
          <p className="text-surface-500">Initializing payment...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!clientSecret) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Application Fee Payment</CardTitle>
        <CardDescription>
          Complete your application for {listingTitle}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-emerald-600 mt-0.5" />
            <div>
              <p className="font-medium text-emerald-800">FARE Act Compliant</p>
              <p className="text-sm text-emerald-700">
                Application fee capped at $20 per NYC Local Law 18 of 2024
              </p>
            </div>
          </div>
        </div>

        <StripePayment
          clientSecret={clientSecret}
          amount={feeAmount}
          description="Application Fee"
          onSuccess={(paymentIntentId) => {
            console.log('Payment succeeded:', paymentIntentId);
            onSuccess();
          }}
          onError={(error) => {
            console.error('Payment error:', error);
          }}
        />
      </CardContent>
    </Card>
  );
}

interface SecurityDepositPaymentProps {
  leaseId: string;
  propertyAddress: string;
  depositAmount: number;
  onSuccess: () => void;
}

export function SecurityDepositPayment({
  leaseId,
  propertyAddress,
  depositAmount,
  onSuccess,
}: SecurityDepositPaymentProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function createPaymentIntent() {
      try {
        const response = await fetch(`/api/v1/leases/${leaseId}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'security_deposit' }),
        });

        if (!response.ok) {
          throw new Error('Failed to create payment intent');
        }

        const data = await response.json();
        setClientSecret(data.data.clientSecret);
      } catch (err) {
        setError('Failed to initialize payment. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }

    createPaymentIntent();
  }, [leaseId]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-luxury-bronze" />
          <p className="text-surface-500">Initializing payment...</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !clientSecret) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-red-600 mb-4">{error || 'Payment unavailable'}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security Deposit</CardTitle>
        <CardDescription>{propertyAddress}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800">Deposit Protection</p>
              <p className="text-sm text-blue-700">
                Your security deposit is held in a separate escrow account as required by NY law
              </p>
            </div>
          </div>
        </div>

        <StripePayment
          clientSecret={clientSecret}
          amount={depositAmount}
          description="Security Deposit"
          onSuccess={(paymentIntentId) => {
            console.log('Deposit payment succeeded:', paymentIntentId);
            onSuccess();
          }}
          onError={(error) => {
            console.error('Deposit payment error:', error);
          }}
        />
      </CardContent>
    </Card>
  );
}
