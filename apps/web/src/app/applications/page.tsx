/**
 * RealRiches Applications Page
 * View and manage rental applications
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getApiClient, formatCurrency, formatDate } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  UNDER_REVIEW: 'bg-blue-100 text-blue-800',
  CONDITIONAL_OFFER: 'bg-purple-100 text-purple-800',
  FCHA_PENDING: 'bg-orange-100 text-orange-800',
  FCHA_APPROVED: 'bg-green-100 text-green-800',
  FCHA_DENIED: 'bg-red-100 text-red-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  WITHDRAWN: 'bg-gray-100 text-gray-800',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending Review',
  UNDER_REVIEW: 'Under Review',
  CONDITIONAL_OFFER: 'Conditional Offer',
  FCHA_PENDING: 'Background Check',
  FCHA_APPROVED: 'Background Approved',
  FCHA_DENIED: 'Background Denied',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export default function ApplicationsPage() {
  const { user, isAuthenticated } = useAuth();
  const [filter, setFilter] = useState<string>('all');

  const { data: applications, isLoading, error } = useQuery({
    queryKey: ['applications', filter],
    queryFn: async () => {
      const client = getApiClient();
      const result = await client.applications.list({ status: filter === 'all' ? undefined : filter });
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch applications');
      }
      return result.data!;
    },
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold text-charcoal-900 mb-4">
            Sign In Required
          </h1>
          <p className="text-charcoal-600 mb-6">
            Please sign in to view your applications.
          </p>
          <Link href="/auth/login?redirect=/applications" className="btn-primary">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-50">
      {/* Header */}
      <div className="bg-charcoal-900 py-12">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-display font-bold text-white mb-2">
            My Applications
          </h1>
          <p className="text-charcoal-300">
            Track and manage your rental applications
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-8">
          {['all', 'PENDING', 'UNDER_REVIEW', 'CONDITIONAL_OFFER', 'APPROVED', 'REJECTED'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === status
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-charcoal-600 hover:bg-charcoal-50'
              }`}
            >
              {status === 'all' ? 'All' : STATUS_LABELS[status] || status}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-600 border-t-transparent"></div>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-600">Failed to load applications. Please try again.</p>
          </div>
        ) : applications?.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-xl font-display font-semibold text-charcoal-900 mb-2">
              No Applications Yet
            </h2>
            <p className="text-charcoal-600 mb-6">
              Start browsing listings to find your perfect home.
            </p>
            <Link href="/listings" className="btn-primary">
              Browse Listings
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {applications?.map((app: any) => (
              <ApplicationCard key={app.id} application={app} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApplicationCard({ application }: { application: any }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card overflow-hidden">
      <div className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Listing Info */}
          <div className="flex gap-4">
            <div className="w-24 h-24 rounded-lg bg-charcoal-200 flex-shrink-0 overflow-hidden">
              {application.listing?.images?.[0] && (
                <img
                  src={application.listing.images[0].url}
                  alt={application.listing.title}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div>
              <h3 className="font-display font-semibold text-lg text-charcoal-900">
                {application.listing?.title || 'Listing'}
              </h3>
              <p className="text-charcoal-600 text-sm">
                {application.listing?.address}, {application.listing?.city}
              </p>
              <p className="text-teal-600 font-semibold mt-1">
                {formatCurrency(application.listing?.monthlyRent || 0)}/mo
              </p>
            </div>
          </div>

          {/* Status & Actions */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[application.status]}`}>
                {STATUS_LABELS[application.status] || application.status}
              </span>
              <p className="text-sm text-charcoal-500 mt-1">
                Applied {formatDate(application.createdAt)}
              </p>
            </div>

            <button
              onClick={() => setExpanded(!expanded)}
              className="btn-outline"
            >
              {expanded ? 'Less' : 'Details'}
            </button>
          </div>
        </div>

        {/* Expanded Details */}
        {expanded && (
          <div className="mt-6 pt-6 border-t border-charcoal-100">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-charcoal-500 mb-1">Application Fee</p>
                <p className="font-medium">{formatCurrency(application.applicationFee || 2000)}</p>
              </div>
              <div>
                <p className="text-sm text-charcoal-500 mb-1">Move-in Date</p>
                <p className="font-medium">
                  {application.desiredMoveIn ? formatDate(application.desiredMoveIn) : 'Flexible'}
                </p>
              </div>
              <div>
                <p className="text-sm text-charcoal-500 mb-1">Documents</p>
                <p className="font-medium">{application.documents?.length || 0} uploaded</p>
              </div>
              <div>
                <p className="text-sm text-charcoal-500 mb-1">Last Updated</p>
                <p className="font-medium">{formatDate(application.updatedAt)}</p>
              </div>
            </div>

            {/* Status Timeline */}
            <div className="mt-6">
              <h4 className="font-medium text-charcoal-900 mb-4">Application Progress</h4>
              <div className="flex items-center gap-2">
                <StatusStep label="Submitted" completed={true} />
                <div className="flex-1 h-1 bg-charcoal-200 rounded">
                  <div className={`h-full bg-teal-600 rounded ${application.status !== 'PENDING' ? 'w-full' : 'w-0'}`}></div>
                </div>
                <StatusStep 
                  label="Review" 
                  completed={['UNDER_REVIEW', 'CONDITIONAL_OFFER', 'FCHA_PENDING', 'FCHA_APPROVED', 'APPROVED'].includes(application.status)} 
                />
                <div className="flex-1 h-1 bg-charcoal-200 rounded">
                  <div className={`h-full bg-teal-600 rounded ${['CONDITIONAL_OFFER', 'FCHA_PENDING', 'FCHA_APPROVED', 'APPROVED'].includes(application.status) ? 'w-full' : 'w-0'}`}></div>
                </div>
                <StatusStep 
                  label="Background" 
                  completed={['FCHA_APPROVED', 'APPROVED'].includes(application.status)} 
                  pending={application.status === 'FCHA_PENDING'}
                />
                <div className="flex-1 h-1 bg-charcoal-200 rounded">
                  <div className={`h-full bg-teal-600 rounded ${application.status === 'APPROVED' ? 'w-full' : 'w-0'}`}></div>
                </div>
                <StatusStep 
                  label="Approved" 
                  completed={application.status === 'APPROVED'} 
                />
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex gap-3">
              <Link href={`/listings/${application.listingId}`} className="btn-outline">
                View Listing
              </Link>
              {application.status === 'PENDING' && (
                <button className="btn-secondary">
                  Withdraw Application
                </button>
              )}
              {application.status === 'APPROVED' && (
                <Link href={`/leases/${application.leaseId}`} className="btn-primary">
                  View Lease
                </Link>
              )}
            </div>

            {/* FCHA Notice */}
            {['CONDITIONAL_OFFER', 'FCHA_PENDING'].includes(application.status) && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Fair Chance Housing Act Notice:</strong> Per NYC's Fair Chance Housing Act, 
                  any criminal history review will only occur after you've received a conditional offer. 
                  Your rights are protected under Article 23-A of the Correction Law.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusStep({ label, completed, pending }: { label: string; completed: boolean; pending?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
        completed 
          ? 'bg-teal-600 text-white' 
          : pending 
            ? 'bg-orange-500 text-white animate-pulse'
            : 'bg-charcoal-200 text-charcoal-500'
      }`}>
        {completed ? '✓' : pending ? '...' : '○'}
      </div>
      <span className="text-xs text-charcoal-500 mt-1">{label}</span>
    </div>
  );
}
