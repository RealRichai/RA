'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { serverFetch, formatCurrency, formatDate } from '@/lib/api';
import Link from 'next/link';

interface Payment {
  id: string;
  leaseId: string;
  amount: number;
  platformFee: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  type: 'RENT' | 'SECURITY_DEPOSIT' | 'APPLICATION_FEE' | 'BROKER_FEE' | 'OTHER';
  dueDate: string;
  paidAt?: string;
  stripePaymentIntentId?: string;
  lease: {
    listing: {
      title: string;
      address: string;
    };
  };
  createdAt: string;
}

interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_account';
  last4: string;
  brand?: string;
  bankName?: string;
  isDefault: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  REFUNDED: 'bg-gray-100 text-gray-800',
};

const TYPE_LABELS: Record<string, string> = {
  RENT: 'Monthly Rent',
  SECURITY_DEPOSIT: 'Security Deposit',
  APPLICATION_FEE: 'Application Fee',
  BROKER_FEE: 'Broker Fee',
  OTHER: 'Other',
};

export default function PaymentsPage() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [showAddMethod, setShowAddMethod] = useState(false);

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments', activeTab],
    queryFn: () => serverFetch<{ payments: Payment[] }>(
      `/payments?status=${activeTab === 'upcoming' ? 'PENDING' : 'COMPLETED,FAILED,REFUNDED'}`
    ),
    enabled: isAuthenticated,
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => serverFetch<{ methods: PaymentMethod[] }>('/payments/methods'),
    enabled: isAuthenticated,
  });

  const makePayment = useMutation({
    mutationFn: (paymentId: string) => 
      serverFetch(`/payments/${paymentId}/pay`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setSelectedPayment(null);
    },
  });

  const setDefaultMethod = useMutation({
    mutationFn: (methodId: string) =>
      serverFetch(`/payments/methods/${methodId}/default`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-display font-semibold text-charcoal mb-4">Sign In Required</h2>
          <p className="text-gray-600 mb-6">Please sign in to view your payments.</p>
          <Link href="/auth/login" className="btn-primary">Sign In</Link>
        </div>
      </div>
    );
  }

  const upcomingPayments = payments?.payments?.filter(p => p.status === 'PENDING') || [];
  const totalDue = upcomingPayments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-charcoal">Payments</h1>
            <p className="text-gray-600 mt-2">Manage your rent payments and payment methods</p>
          </div>
          <button
            onClick={() => setShowAddMethod(true)}
            className="btn-secondary mt-4 md:mt-0"
          >
            + Add Payment Method
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="card p-4">
                <div className="text-sm text-gray-500">Total Due</div>
                <div className="text-2xl font-semibold text-teal">{formatCurrency(totalDue)}</div>
              </div>
              <div className="card p-4">
                <div className="text-sm text-gray-500">Upcoming Payments</div>
                <div className="text-2xl font-semibold text-charcoal">{upcomingPayments.length}</div>
              </div>
              <div className="card p-4">
                <div className="text-sm text-gray-500">Next Due Date</div>
                <div className="text-2xl font-semibold text-charcoal">
                  {upcomingPayments[0]?.dueDate 
                    ? formatDate(upcomingPayments[0].dueDate)
                    : 'N/A'}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setActiveTab('upcoming')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'upcoming'
                    ? 'bg-teal text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                Upcoming
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'history'
                    ? 'bg-teal text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                Payment History
              </button>
            </div>

            {/* Payments List */}
            {paymentsLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal"></div>
              </div>
            ) : payments?.payments?.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="text-6xl mb-4">💳</div>
                <h3 className="text-xl font-semibold text-charcoal mb-2">
                  {activeTab === 'upcoming' ? 'No Upcoming Payments' : 'No Payment History'}
                </h3>
                <p className="text-gray-600">
                  {activeTab === 'upcoming' 
                    ? 'You have no pending payments at this time.'
                    : 'Your payment history will appear here.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {payments?.payments?.map(payment => (
                  <div key={payment.id} className="card p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-charcoal">
                            {TYPE_LABELS[payment.type]}
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[payment.status]}`}>
                            {payment.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {payment.lease.listing.title} • {payment.lease.listing.address}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Due: {formatDate(payment.dueDate)}
                          {payment.paidAt && ` • Paid: ${formatDate(payment.paidAt)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-xl font-semibold text-charcoal">
                            {formatCurrency(payment.amount)}
                          </div>
                          {payment.platformFee > 0 && (
                            <div className="text-xs text-gray-400">
                              Includes {formatCurrency(payment.platformFee)} fee
                            </div>
                          )}
                        </div>
                        {payment.status === 'PENDING' && (
                          <button
                            onClick={() => setSelectedPayment(payment)}
                            className="btn-primary text-sm"
                          >
                            Pay Now
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar - Payment Methods */}
          <div>
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-charcoal mb-4">Payment Methods</h3>
              
              {paymentMethods?.methods?.length === 0 ? (
                <div className="text-center py-6">
                  <div className="text-4xl mb-2">💳</div>
                  <p className="text-sm text-gray-500 mb-4">No payment methods added</p>
                  <button
                    onClick={() => setShowAddMethod(true)}
                    className="btn-primary text-sm w-full"
                  >
                    Add Payment Method
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentMethods?.methods?.map(method => (
                    <div 
                      key={method.id}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        method.isDefault 
                          ? 'border-teal bg-teal/5' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">
                            {method.type === 'card' ? '💳' : '🏦'}
                          </div>
                          <div>
                            <div className="font-medium text-charcoal">
                              {method.type === 'card' 
                                ? `${method.brand} •••• ${method.last4}`
                                : `${method.bankName} •••• ${method.last4}`}
                            </div>
                            {method.isDefault && (
                              <span className="text-xs text-teal">Default</span>
                            )}
                          </div>
                        </div>
                        {!method.isDefault && (
                          <button
                            onClick={() => setDefaultMethod.mutate(method.id)}
                            className="text-sm text-teal hover:underline"
                          >
                            Set Default
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Auto-Pay Setting */}
              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-charcoal">Auto-Pay</h4>
                    <p className="text-sm text-gray-500">Automatically pay on due date</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal"></div>
                  </label>
                </div>
              </div>

              {/* FARE Act Notice */}
              <div className="mt-6 p-4 bg-teal/10 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-teal">ℹ️</span>
                  <div className="text-sm text-gray-600">
                    <strong>FARE Act Compliant:</strong> All fees are transparently disclosed. 
                    Application fees are capped at $20 per NYC Local Law 18.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pay Modal */}
        {selectedPayment && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <h3 className="text-xl font-display font-semibold text-charcoal mb-4">
                Confirm Payment
              </h3>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">{TYPE_LABELS[selectedPayment.type]}</span>
                  <span className="font-semibold">{formatCurrency(selectedPayment.amount)}</span>
                </div>
                <div className="text-sm text-gray-500">
                  {selectedPayment.lease.listing.title}
                </div>
                {selectedPayment.platformFee > 0 && (
                  <div className="mt-2 pt-2 border-t text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Platform Fee (1%)</span>
                      <span>{formatCurrency(selectedPayment.platformFee)}</span>
                    </div>
                  </div>
                )}
              </div>

              {paymentMethods?.methods?.find(m => m.isDefault) ? (
                <div className="p-3 bg-gray-100 rounded-lg mb-6">
                  <div className="text-sm text-gray-600">Paying with</div>
                  <div className="font-medium">
                    {paymentMethods.methods.find(m => m.isDefault)?.brand} •••• 
                    {paymentMethods.methods.find(m => m.isDefault)?.last4}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-yellow-50 rounded-lg mb-6">
                  <p className="text-sm text-yellow-800">
                    Please add a payment method to continue.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedPayment(null)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={() => makePayment.mutate(selectedPayment.id)}
                  disabled={makePayment.isPending || !paymentMethods?.methods?.some(m => m.isDefault)}
                  className="btn-primary flex-1"
                >
                  {makePayment.isPending ? 'Processing...' : `Pay ${formatCurrency(selectedPayment.amount)}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Payment Method Modal */}
        {showAddMethod && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <h3 className="text-xl font-display font-semibold text-charcoal mb-4">
                Add Payment Method
              </h3>
              <p className="text-gray-600 mb-6">
                Add a credit card or bank account to make payments.
              </p>
              
              <div className="space-y-4">
                <button className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-teal transition-colors flex items-center gap-4">
                  <span className="text-2xl">💳</span>
                  <div className="text-left">
                    <div className="font-medium">Credit or Debit Card</div>
                    <div className="text-sm text-gray-500">Visa, Mastercard, Amex</div>
                  </div>
                </button>
                <button className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-teal transition-colors flex items-center gap-4">
                  <span className="text-2xl">🏦</span>
                  <div className="text-left">
                    <div className="font-medium">Bank Account (ACH)</div>
                    <div className="text-sm text-gray-500">Lower fees for rent payments</div>
                  </div>
                </button>
              </div>

              <p className="text-xs text-gray-400 mt-4 text-center">
                Secured by Stripe. Your payment information is encrypted.
              </p>

              <button
                onClick={() => setShowAddMethod(false)}
                className="w-full btn-secondary mt-6"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
