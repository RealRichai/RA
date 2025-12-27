'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  MapPin,
  Square,
  DollarSign,
  Calendar,
  ArrowLeft,
  Phone,
  Mail,
  Loader2,
  AlertCircle,
  CheckCircle,
  Briefcase,
  Store,
  Warehouse,
  Utensils,
  Stethoscope,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/header';
import { cn, formatCurrency } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface CommercialListing {
  id: string;
  title: string;
  address: string;
  borough: string;
  neighborhood: string;
  type: string;
  size: number;
  price: number;
  pricePerSqFt: number;
  availableDate: string;
  features: string[];
  status: string;
}

const typeIcons: Record<string, React.ElementType> = {
  RETAIL: Store,
  OFFICE: Briefcase,
  WAREHOUSE: Warehouse,
  RESTAURANT: Utensils,
  MEDICAL: Stethoscope,
};

const typeColors: Record<string, string> = {
  RETAIL: 'bg-purple-100 text-purple-700',
  OFFICE: 'bg-blue-100 text-blue-700',
  WAREHOUSE: 'bg-amber-100 text-amber-700',
  RESTAURANT: 'bg-rose-100 text-rose-700',
  MEDICAL: 'bg-emerald-100 text-emerald-700',
};

export default function CommercialDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [listing, setListing] = useState<CommercialListing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchListing = async () => {
      try {
        const response = await fetch(`${API_BASE}/commercial/listings/${params.id}`);
        const data = await response.json();

        if (data.error) {
          setError(data.error.message);
        } else {
          setListing(data.data);
        }
      } catch (err) {
        setError('Failed to fetch listing');
      } finally {
        setIsLoading(false);
      }
    };

    if (params.id) {
      fetchListing();
    }
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <Card className="py-16">
            <div className="text-center">
              <AlertCircle className="h-16 w-16 text-surface-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-surface-900 mb-2">
                Listing Not Found
              </h2>
              <p className="text-surface-600 mb-6">
                {error || 'The requested commercial listing could not be found.'}
              </p>
              <Button asChild>
                <Link href="/commercial">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Listings
                </Link>
              </Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  const TypeIcon = typeIcons[listing.type] || Building2;

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Button */}
        <Button variant="ghost" className="mb-6" asChild>
          <Link href="/commercial">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Commercial Listings
          </Link>
        </Button>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Card */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className={cn('p-4 rounded-xl', typeColors[listing.type] || 'bg-surface-100')}>
                    <TypeIcon className="h-8 w-8" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={cn('text-sm', typeColors[listing.type])}>
                        {listing.type}
                      </Badge>
                      <Badge variant={listing.status === 'ACTIVE' ? 'success' : 'default'}>
                        {listing.status}
                      </Badge>
                    </div>
                    <h1 className="text-2xl font-bold text-surface-900">{listing.title}</h1>
                    <div className="flex items-center gap-1 text-surface-500 mt-2">
                      <MapPin className="h-4 w-4" />
                      {listing.address}
                    </div>
                    <p className="text-sm text-surface-500 mt-1">
                      {listing.neighborhood}, {listing.borough}
                    </p>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-surface-50 rounded-xl">
                  <div className="text-center">
                    <Square className="h-5 w-5 text-surface-400 mx-auto mb-2" />
                    <p className="text-xl font-bold text-surface-900">{listing.size.toLocaleString()}</p>
                    <p className="text-sm text-surface-500">Square Feet</p>
                  </div>
                  <div className="text-center">
                    <DollarSign className="h-5 w-5 text-surface-400 mx-auto mb-2" />
                    <p className="text-xl font-bold text-luxury-bronze">${listing.pricePerSqFt.toFixed(2)}</p>
                    <p className="text-sm text-surface-500">Per Sq Ft</p>
                  </div>
                  <div className="text-center">
                    <Calendar className="h-5 w-5 text-surface-400 mx-auto mb-2" />
                    <p className="text-xl font-bold text-surface-900">
                      {new Date(listing.availableDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-sm text-surface-500">Available</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Features */}
            <Card>
              <CardHeader>
                <CardTitle>Features & Amenities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-3">
                  {listing.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      <span className="text-surface-700">{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Description placeholder */}
            <Card>
              <CardHeader>
                <CardTitle>About This Space</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-surface-600">
                  This {listing.type.toLowerCase()} space offers {listing.size.toLocaleString()} square feet
                  of prime commercial real estate in {listing.neighborhood}, {listing.borough}.
                  Available starting {new Date(listing.availableDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
                </p>
                <p className="text-surface-600 mt-4">
                  Located in one of NYC's most desirable commercial corridors, this space is perfect for
                  businesses looking to establish or expand their presence in the city.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Pricing Card */}
            <Card className="sticky top-24">
              <CardContent className="p-6">
                <div className="text-center mb-6">
                  <p className="text-sm text-surface-500">Monthly Rent</p>
                  <p className="text-3xl font-bold text-luxury-bronze">
                    {formatCurrency(listing.price)}
                  </p>
                  <p className="text-sm text-surface-500">/month</p>
                </div>

                <div className="space-y-3">
                  <Button className="w-full" size="lg">
                    <Phone className="h-4 w-4 mr-2" />
                    Schedule a Tour
                  </Button>
                  <Button variant="outline" className="w-full" size="lg">
                    <Mail className="h-4 w-4 mr-2" />
                    Contact Agent
                  </Button>
                </div>

                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-medium text-surface-900 mb-3">Quick Facts</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-surface-500">Property Type</span>
                      <span className="font-medium text-surface-900">{listing.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-surface-500">Size</span>
                      <span className="font-medium text-surface-900">{listing.size.toLocaleString()} SF</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-surface-500">Price/SF</span>
                      <span className="font-medium text-surface-900">${listing.pricePerSqFt.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-surface-500">Borough</span>
                      <span className="font-medium text-surface-900">{listing.borough}</span>
                    </div>
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
