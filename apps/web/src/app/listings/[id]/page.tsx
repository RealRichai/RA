'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate, getPropertyTypeLabel } from '@/lib/utils';
import api from '@/lib/api-client';
import type { Listing } from '@/types';
import {
  ArrowLeft,
  MapPin,
  Bed,
  Bath,
  Square,
  Calendar,
  Building2,
  Heart,
  Share2,
  Phone,
  Mail,
  CheckCircle,
  DollarSign,
  Home,
  Shield,
  Info,
} from 'lucide-react';

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [listing, setListing] = React.useState<Listing | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeImageIndex, setActiveImageIndex] = React.useState(0);

  React.useEffect(() => {
    async function loadListing() {
      try {
        const response = await api.getListing(params.id as string);
        setListing(response.listing);
      } catch (error) {
        console.error('Failed to load listing:', error);
      } finally {
        setLoading(false);
      }
    }

    if (params.id) {
      loadListing();
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading listing...</div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Listing Not Found</h1>
          <p className="text-muted-foreground mb-4">This listing may have been removed</p>
          <Link href="/listings">
            <Button>Browse Listings</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="p-2 hover:bg-muted rounded-md">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <Link href="/" className="font-heading text-xl font-semibold">
              RealRiches
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <Share2 className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Heart className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left column - Images and details */}
          <div className="lg:col-span-2 space-y-8">
            {/* Image gallery */}
            <div className="space-y-4">
              <div className="aspect-[16/10] bg-muted rounded-lg overflow-hidden">
                {listing.photos?.length ? (
                  <img
                    src={listing.photos[activeImageIndex]?.url}
                    alt={listing.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Building2 className="h-24 w-24 text-muted-foreground" />
                  </div>
                )}
              </div>
              {listing.photos && listing.photos.length > 1 && (
                <div className="grid grid-cols-5 gap-2">
                  {listing.photos.slice(0, 5).map((photo, index) => (
                    <button
                      key={index}
                      onClick={() => setActiveImageIndex(index)}
                      className={`aspect-square rounded-md overflow-hidden ${
                        index === activeImageIndex ? 'ring-2 ring-primary' : ''
                      }`}
                    >
                      <img
                        src={photo.url}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Title and price */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {listing.fareActCompliant && (
                  <Badge className="bg-green-500">FARE Act Compliant</Badge>
                )}
                <Badge variant="outline">{getPropertyTypeLabel(listing.propertyType)}</Badge>
              </div>
              <h1 className="font-heading text-3xl font-semibold mb-2">{listing.title || listing.address}</h1>
              <div className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>
                  {listing.address}
                  {listing.unit && ` #${listing.unit}`}, {listing.neighborhood || listing.borough}, {listing.city}, {listing.state} {listing.zipCode}
                </span>
              </div>
            </div>

            {/* Key details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-muted rounded-lg text-center">
                <Bed className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="font-semibold">{listing.bedrooms}</p>
                <p className="text-sm text-muted-foreground">Bedrooms</p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <Bath className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="font-semibold">{listing.bathrooms}</p>
                <p className="text-sm text-muted-foreground">Bathrooms</p>
              </div>
              {listing.squareFeet && (
                <div className="p-4 bg-muted rounded-lg text-center">
                  <Square className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="font-semibold">{listing.squareFeet.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Sq Ft</p>
                </div>
              )}
              <div className="p-4 bg-muted rounded-lg text-center">
                <Calendar className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="font-semibold">
                  {listing.availableDate ? formatDate(listing.availableDate) : 'Now'}
                </p>
                <p className="text-sm text-muted-foreground">Available</p>
              </div>
            </div>

            {/* Description */}
            <div>
              <h2 className="font-heading text-xl font-semibold mb-4">About this property</h2>
              <p className="text-muted-foreground whitespace-pre-line">
                {listing.description || listing.aiDescription}
              </p>
            </div>

            {/* AI Highlights */}
            {listing.aiHighlights && listing.aiHighlights.length > 0 && (
              <div>
                <h2 className="font-heading text-xl font-semibold mb-4">Highlights</h2>
                <ul className="space-y-2">
                  {listing.aiHighlights.map((highlight, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Amenities */}
            {listing.amenities && listing.amenities.length > 0 && (
              <div>
                <h2 className="font-heading text-xl font-semibold mb-4">Amenities</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {listing.amenities.map((amenity, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">{amenity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pet Policy */}
            {listing.petPolicy && (
              <div>
                <h2 className="font-heading text-xl font-semibold mb-4">Pet Policy</h2>
                <p className="text-muted-foreground">{listing.petPolicy}</p>
              </div>
            )}
          </div>

          {/* Right column - Pricing and contact */}
          <div className="space-y-6">
            {/* Pricing card */}
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle>
                  <span className="font-heading text-3xl">
                    {formatCurrency(listing.rentPrice || 0)}
                  </span>
                  <span className="text-lg font-normal text-muted-foreground">/month</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Move-in costs */}
                <div className="space-y-3">
                  <h3 className="font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Move-in Costs
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">First Month</span>
                      <span>{formatCurrency(listing.rentPrice || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Security Deposit</span>
                      <span>{formatCurrency(listing.securityDeposit || listing.rentPrice || 0)}</span>
                    </div>
                    {listing.brokerFee && listing.brokerFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Broker Fee</span>
                        <span>{formatCurrency(listing.brokerFee)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Application Fee</span>
                      <span>{formatCurrency(listing.applicationFee || 20)}</span>
                    </div>
                    <div className="pt-2 border-t border-border flex justify-between font-medium">
                      <span>Total Move-in</span>
                      <span>
                        {formatCurrency(
                          (listing.rentPrice || 0) +
                          (listing.securityDeposit || listing.rentPrice || 0) +
                          (listing.brokerFee || 0) +
                          (listing.applicationFee || 20)
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* FARE Act notice */}
                {listing.fareActCompliant && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-md">
                    <div className="flex items-start gap-2 text-sm">
                      <Shield className="h-4 w-4 text-green-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-green-700 dark:text-green-400">FARE Act Compliant</p>
                        <p className="text-green-600 dark:text-green-500 text-xs mt-1">
                          Application fee capped at $20. Security deposit limited to 1 month&apos;s rent.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lease terms */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lease Term</span>
                    <span>{listing.leaseTermMonths || 12} months</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Available</span>
                    <span>{listing.availableDate ? formatDate(listing.availableDate) : 'Immediately'}</span>
                  </div>
                </div>

                {/* CTA buttons */}
                <div className="space-y-3">
                  <Link href={`/listings/${listing.id}/apply`} className="block">
                    <Button className="w-full" size="lg">
                      Apply Now
                    </Button>
                  </Link>
                  <Button variant="outline" className="w-full" size="lg">
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Tour
                  </Button>
                </div>

                {/* Contact */}
                <div className="pt-4 border-t border-border space-y-3">
                  <h3 className="font-medium">Contact</h3>
                  {listing.agent && (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        {listing.agent.firstName?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium">
                          {listing.agent.firstName} {listing.agent.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">Licensed Agent</p>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Phone className="h-4 w-4 mr-2" />
                      Call
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Mail className="h-4 w-4 mr-2" />
                      Email
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
