/**
 * RealRiches Listing Detail Page
 * View listing details and apply
 */

'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useListing, useToggleFavorite } from '@/hooks/useListings';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatDate } from '@/lib/api';

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const { data: listing, isLoading, error } = useListing(id);
  const { user, isAuthenticated } = useAuth();
  const toggleFavorite = useToggleFavorite();
  
  const [selectedImage, setSelectedImage] = useState(0);
  const [showApplyModal, setShowApplyModal] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-600 border-t-transparent"></div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold text-charcoal-900 mb-4">
            Listing Not Found
          </h1>
          <Link href="/listings" className="btn-primary">
            Browse Listings
          </Link>
        </div>
      </div>
    );
  }

  const handleApply = () => {
    if (!isAuthenticated) {
      router.push(`/auth/login?redirect=/listings/${id}`);
      return;
    }
    if (user?.role !== 'TENANT') {
      alert('Only tenants can apply to listings');
      return;
    }
    setShowApplyModal(true);
  };

  const handleFavorite = () => {
    if (!isAuthenticated) {
      router.push(`/auth/login?redirect=/listings/${id}`);
      return;
    }
    toggleFavorite.mutate({ listingId: id, isFavorite: listing.isFavorite });
  };

  return (
    <div className="min-h-screen bg-cream-50">
      {/* Image Gallery */}
      <div className="bg-charcoal-900">
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Main Image */}
            <div className="relative h-96 lg:h-[500px] rounded-lg overflow-hidden bg-charcoal-800">
              {listing.images?.[selectedImage] ? (
                <Image
                  src={listing.images[selectedImage].url}
                  alt={listing.title}
                  fill
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="flex items-center justify-center h-full text-charcoal-400">
                  No Images Available
                </div>
              )}
            </div>

            {/* Thumbnail Grid */}
            <div className="grid grid-cols-3 gap-2">
              {listing.images?.slice(0, 6).map((img: any, idx: number) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedImage(idx)}
                  className={`relative h-24 lg:h-32 rounded-lg overflow-hidden ${
                    idx === selectedImage ? 'ring-2 ring-gold-500' : ''
                  }`}
                >
                  <Image
                    src={img.url}
                    alt={`${listing.title} - Image ${idx + 1}`}
                    fill
                    className="object-cover hover:opacity-80 transition-opacity"
                  />
                  {idx === 5 && listing.images.length > 6 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold">
                      +{listing.images.length - 6}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header */}
            <div>
              <div className="flex gap-2 mb-3">
                {listing.noFee && (
                  <span className="bg-teal-600 text-white text-sm font-bold px-3 py-1 rounded">
                    NO FEE
                  </span>
                )}
                <span className="bg-charcoal-100 text-charcoal-700 text-sm px-3 py-1 rounded">
                  {listing.propertyType}
                </span>
              </div>

              <h1 className="text-3xl lg:text-4xl font-display font-bold text-charcoal-900 mb-2">
                {listing.title}
              </h1>
              <p className="text-lg text-charcoal-600">
                {listing.address}, {listing.neighborhood}, {listing.city}, {listing.state} {listing.zipCode}
              </p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-teal-600">
                  {listing.bedrooms === 0 ? 'Studio' : listing.bedrooms}
                </p>
                <p className="text-sm text-charcoal-500">Bedrooms</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-teal-600">{listing.bathrooms}</p>
                <p className="text-sm text-charcoal-500">Bathrooms</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-teal-600">
                  {listing.squareFeet?.toLocaleString() || 'N/A'}
                </p>
                <p className="text-sm text-charcoal-500">Sq Ft</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-teal-600">
                  {listing.availableDate ? formatDate(listing.availableDate) : 'Now'}
                </p>
                <p className="text-sm text-charcoal-500">Available</p>
              </div>
            </div>

            {/* Description */}
            <div className="card p-6">
              <h2 className="text-xl font-display font-semibold text-charcoal-900 mb-4">
                About This Property
              </h2>
              <p className="text-charcoal-600 whitespace-pre-line">
                {listing.description}
              </p>
            </div>

            {/* Amenities */}
            {listing.amenities?.length > 0 && (
              <div className="card p-6">
                <h2 className="text-xl font-display font-semibold text-charcoal-900 mb-4">
                  Amenities
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {listing.amenities.map((amenity: string) => (
                    <div key={amenity} className="flex items-center gap-2 text-charcoal-600">
                      <span className="text-teal-600">✓</span>
                      {amenity.replace(/_/g, ' ')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FARE Act Disclosure */}
            <div className="card p-6 border-l-4 border-teal-600">
              <h2 className="text-xl font-display font-semibold text-charcoal-900 mb-4">
                FARE Act Disclosure
              </h2>
              <div className="space-y-3 text-charcoal-600">
                <p>
                  <strong>Application Fee:</strong> {formatCurrency(listing.applicationFee)} (max $20 per NYC FARE Act)
                </p>
                <p>
                  <strong>Security Deposit:</strong> {formatCurrency(listing.securityDeposit)} (max 1 month rent)
                </p>
                <p>
                  <strong>Broker Fee:</strong> {listing.noFee ? 'No broker fee' : `${listing.brokerFeePercent || 0}% of annual rent`}
                </p>
                <p>
                  <strong>Fee Paid By:</strong> {listing.brokerFeePaidBy || 'Landlord'}
                </p>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="card p-6 sticky top-24">
              {/* Price */}
              <div className="text-center mb-6 pb-6 border-b border-charcoal-100">
                <p className="text-4xl font-display font-bold text-charcoal-900">
                  {formatCurrency(listing.monthlyRent)}
                </p>
                <p className="text-charcoal-500">per month</p>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <button
                  onClick={handleApply}
                  className="btn-primary w-full text-lg py-3"
                >
                  Apply Now
                </button>

                <button
                  onClick={handleFavorite}
                  disabled={toggleFavorite.isPending}
                  className="btn-outline w-full"
                >
                  {listing.isFavorite ? '♥ Saved' : '♡ Save to Favorites'}
                </button>

                <button className="btn-secondary w-full">
                  Schedule Tour
                </button>

                <button className="btn-outline w-full">
                  Contact Agent
                </button>
              </div>

              {/* Agent Info */}
              {listing.agent && (
                <div className="mt-6 pt-6 border-t border-charcoal-100">
                  <p className="text-sm text-charcoal-500 mb-2">Listed by</p>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-charcoal-200"></div>
                    <div>
                      <p className="font-semibold text-charcoal-900">
                        {listing.agent.firstName} {listing.agent.lastName}
                      </p>
                      <p className="text-sm text-charcoal-500">Licensed Agent</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Facts */}
              <div className="mt-6 pt-6 border-t border-charcoal-100 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-charcoal-500">Listed</span>
                  <span className="text-charcoal-900">{formatDate(listing.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal-500">Views</span>
                  <span className="text-charcoal-900">{listing.viewCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-charcoal-500">Market</span>
                  <span className="text-charcoal-900">{listing.market?.name}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Apply Modal */}
      {showApplyModal && (
        <ApplyModal
          listing={listing}
          onClose={() => setShowApplyModal(false)}
        />
      )}
    </div>
  );
}

function ApplyModal({ listing, onClose }: { listing: any; onClose: () => void }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    // In production, this would create the application via API
    // For now, redirect to applications page
    router.push('/applications');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-2xl font-display font-bold text-charcoal-900 mb-4">
          Apply for {listing.title}
        </h2>

        <div className="space-y-4 mb-6">
          <div className="bg-cream-50 p-4 rounded-lg">
            <p className="text-sm text-charcoal-600 mb-2">Application Fee</p>
            <p className="text-xl font-bold text-charcoal-900">
              {formatCurrency(listing.applicationFee)}
            </p>
            <p className="text-xs text-teal-600 mt-1">
              Capped at $20 per FARE Act
            </p>
          </div>

          <p className="text-sm text-charcoal-600">
            By submitting this application, you agree to allow a background and credit check.
            Your application will be reviewed within 5 business days.
          </p>

          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Fair Chance Housing Act:</strong> Criminal history will only be considered
              after a conditional offer, in compliance with Article 23-A.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="btn-outline flex-1"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary flex-1"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </div>
      </div>
    </div>
  );
}
