'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { serverFetch, formatCurrency, formatDate } from '@/lib/api';
import Link from 'next/link';

interface Lease {
  id: string;
  listingId: string;
  status: 'DRAFT' | 'PENDING_SIGNATURE' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit: number;
  signedByTenant: boolean;
  signedByLandlord: boolean;
  docusignEnvelopeId?: string;
  listing: {
    title: string;
    address: string;
    unit?: string;
    images: string[];
  };
  landlord: {
    firstName: string;
    lastName: string;
    email: string;
  };
  tenant: {
    firstName: string;
    lastName: string;
    email: string;
  };
  payments: {
    id: string;
    amount: number;
    status: string;
    dueDate: string;
  }[];
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  PENDING_SIGNATURE: 'bg-yellow-100 text-yellow-800',
  ACTIVE: 'bg-green-100 text-green-800',
  EXPIRED: 'bg-red-100 text-red-800',
  TERMINATED: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_SIGNATURE: 'Pending Signature',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  TERMINATED: 'Terminated',
};

export default function LeasesPage() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);

  const { data: leases, isLoading } = useQuery({
    queryKey: ['leases', statusFilter],
    queryFn: () => serverFetch<{ leases: Lease[] }>(`/leases${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`),
    enabled: isAuthenticated,
  });

  const signLease = useMutation({
    mutationFn: (leaseId: string) => serverFetch(`/leases/${leaseId}/sign`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leases'] });
      setSelectedLease(null);
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-display font-semibold text-charcoal mb-4">Sign In Required</h2>
          <p className="text-gray-600 mb-6">Please sign in to view your leases.</p>
          <Link href="/auth/login" className="btn-primary">Sign In</Link>
        </div>
      </div>
    );
  }

  const activeLeases = leases?.leases?.filter(l => l.status === 'ACTIVE') || [];
  const pendingLeases = leases?.leases?.filter(l => l.status === 'PENDING_SIGNATURE') || [];
  const otherLeases = leases?.leases?.filter(l => !['ACTIVE', 'PENDING_SIGNATURE'].includes(l.status)) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-charcoal">My Leases</h1>
          <p className="text-gray-600 mt-2">Manage your rental agreements and track payments</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="card p-4">
            <div className="text-sm text-gray-500">Active Leases</div>
            <div className="text-2xl font-semibold text-teal">{activeLeases.length}</div>
          </div>
          <div className="card p-4">
            <div className="text-sm text-gray-500">Pending Signature</div>
            <div className="text-2xl font-semibold text-yellow-600">{pendingLeases.length}</div>
          </div>
          <div className="card p-4">
            <div className="text-sm text-gray-500">Total Monthly Rent</div>
            <div className="text-2xl font-semibold text-charcoal">
              {formatCurrency(activeLeases.reduce((sum, l) => sum + l.monthlyRent, 0))}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-sm text-gray-500">Next Payment Due</div>
            <div className="text-2xl font-semibold text-charcoal">
              {activeLeases[0]?.payments?.[0]?.dueDate 
                ? formatDate(activeLeases[0].payments[0].dueDate) 
                : 'N/A'}
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          {['all', 'ACTIVE', 'PENDING_SIGNATURE', 'EXPIRED'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-teal text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {status === 'all' ? 'All Leases' : STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        {/* Leases List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal"></div>
          </div>
        ) : leases?.leases?.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-6xl mb-4">📄</div>
            <h3 className="text-xl font-semibold text-charcoal mb-2">No Leases Yet</h3>
            <p className="text-gray-600 mb-6">
              When you sign a lease for a property, it will appear here.
            </p>
            <Link href="/listings" className="btn-primary">Browse Listings</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {leases?.leases?.map(lease => (
              <div key={lease.id} className="card p-6">
                <div className="flex flex-col md:flex-row gap-6">
                  {/* Property Image */}
                  <div className="w-full md:w-48 h-32 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                    {lease.listing.images?.[0] ? (
                      <img 
                        src={lease.listing.images[0]} 
                        alt={lease.listing.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        No Image
                      </div>
                    )}
                  </div>

                  {/* Lease Details */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-lg font-semibold text-charcoal">
                          {lease.listing.title}
                        </h3>
                        <p className="text-gray-600 text-sm">
                          {lease.listing.address}
                          {lease.listing.unit && `, Unit ${lease.listing.unit}`}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[lease.status]}`}>
                        {STATUS_LABELS[lease.status]}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div>
                        <div className="text-xs text-gray-500">Monthly Rent</div>
                        <div className="font-semibold text-charcoal">{formatCurrency(lease.monthlyRent)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Security Deposit</div>
                        <div className="font-semibold text-charcoal">{formatCurrency(lease.securityDeposit)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Lease Period</div>
                        <div className="font-semibold text-charcoal">
                          {formatDate(lease.startDate)} - {formatDate(lease.endDate)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">
                          {user?.role === 'TENANT' ? 'Landlord' : 'Tenant'}
                        </div>
                        <div className="font-semibold text-charcoal">
                          {user?.role === 'TENANT' 
                            ? `${lease.landlord.firstName} ${lease.landlord.lastName}`
                            : `${lease.tenant.firstName} ${lease.tenant.lastName}`}
                        </div>
                      </div>
                    </div>

                    {/* Signature Status */}
                    {lease.status === 'PENDING_SIGNATURE' && (
                      <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <span className={lease.signedByTenant ? 'text-green-600' : 'text-gray-400'}>
                              {lease.signedByTenant ? '✓' : '○'}
                            </span>
                            <span>Tenant Signature</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={lease.signedByLandlord ? 'text-green-600' : 'text-gray-400'}>
                              {lease.signedByLandlord ? '✓' : '○'}
                            </span>
                            <span>Landlord Signature</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 mt-4">
                      <Link 
                        href={`/leases/${lease.id}`}
                        className="btn-secondary text-sm"
                      >
                        View Details
                      </Link>
                      {lease.status === 'PENDING_SIGNATURE' && (
                        <>
                          {((user?.role === 'TENANT' && !lease.signedByTenant) ||
                            (user?.role === 'LANDLORD' && !lease.signedByLandlord)) && (
                            <button
                              onClick={() => setSelectedLease(lease)}
                              className="btn-primary text-sm"
                            >
                              Sign Lease
                            </button>
                          )}
                        </>
                      )}
                      {lease.status === 'ACTIVE' && (
                        <Link 
                          href={`/payments?leaseId=${lease.id}`}
                          className="btn-primary text-sm"
                        >
                          Make Payment
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sign Lease Modal */}
        {selectedLease && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-lg w-full p-6">
              <h3 className="text-xl font-display font-semibold text-charcoal mb-4">
                Sign Lease Agreement
              </h3>
              <p className="text-gray-600 mb-4">
                You are about to sign the lease for <strong>{selectedLease.listing.title}</strong>.
              </p>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Monthly Rent:</span>
                    <span className="ml-2 font-semibold">{formatCurrency(selectedLease.monthlyRent)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Security Deposit:</span>
                    <span className="ml-2 font-semibold">{formatCurrency(selectedLease.securityDeposit)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Start Date:</span>
                    <span className="ml-2 font-semibold">{formatDate(selectedLease.startDate)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">End Date:</span>
                    <span className="ml-2 font-semibold">{formatDate(selectedLease.endDate)}</span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-6">
                By clicking "Sign Now", you agree to the terms and conditions of this lease agreement.
                A copy will be sent to your email for your records.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setSelectedLease(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => signLease.mutate(selectedLease.id)}
                  disabled={signLease.isPending}
                  className="btn-primary"
                >
                  {signLease.isPending ? 'Signing...' : 'Sign Now'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
