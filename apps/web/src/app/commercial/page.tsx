'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  MapPin,
  Square,
  DollarSign,
  Calendar,
  Filter,
  Search,
  Loader2,
  AlertCircle,
  ArrowRight,
  Briefcase,
  Store,
  Warehouse,
  Utensils,
  Stethoscope,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

function CommercialListingCard({ listing }: { listing: CommercialListing }) {
  const TypeIcon = typeIcons[listing.type] || Building2;

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-4">
            <div className={cn('p-3 rounded-xl', typeColors[listing.type] || 'bg-surface-100')}>
              <TypeIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-surface-900">{listing.title}</h3>
              <div className="flex items-center gap-1 text-sm text-surface-500 mt-1">
                <MapPin className="h-4 w-4" />
                {listing.address}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={cn('text-xs', typeColors[listing.type])}>
                  {listing.type}
                </Badge>
                <span className="text-xs text-surface-500">
                  {listing.neighborhood}, {listing.borough}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-luxury-bronze">
              {formatCurrency(listing.price)}
            </p>
            <p className="text-xs text-surface-500">/month</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-surface-50 rounded-lg">
          <div className="text-center">
            <Square className="h-4 w-4 text-surface-400 mx-auto mb-1" />
            <p className="text-sm font-medium text-surface-900">{listing.size.toLocaleString()}</p>
            <p className="text-xs text-surface-500">sq ft</p>
          </div>
          <div className="text-center">
            <DollarSign className="h-4 w-4 text-surface-400 mx-auto mb-1" />
            <p className="text-sm font-medium text-surface-900">${listing.pricePerSqFt.toFixed(2)}</p>
            <p className="text-xs text-surface-500">per sq ft</p>
          </div>
          <div className="text-center">
            <Calendar className="h-4 w-4 text-surface-400 mx-auto mb-1" />
            <p className="text-sm font-medium text-surface-900">
              {new Date(listing.availableDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
            <p className="text-xs text-surface-500">available</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {listing.features.slice(0, 3).map((feature, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {feature}
            </Badge>
          ))}
          {listing.features.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{listing.features.length - 3} more
            </Badge>
          )}
        </div>

        <Button asChild className="w-full">
          <Link href={`/commercial/${listing.id}`}>
            View Details
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CommercialPage() {
  const [listings, setListings] = useState<CommercialListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [borough, setBorough] = useState('all');
  const [propertyType, setPropertyType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchListings = async () => {
      try {
        const params = new URLSearchParams();
        if (borough !== 'all') params.append('borough', borough);
        if (propertyType !== 'all') params.append('type', propertyType);

        const response = await fetch(`${API_BASE}/commercial/listings?${params}`);
        const data = await response.json();

        if (data.error) {
          setError(data.error.message);
          setIsDemoMode(true);
        } else {
          setListings(data.data || []);
          setIsDemoMode(false);
        }
      } catch (err) {
        setError('Failed to fetch listings');
        setIsDemoMode(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchListings();
  }, [borough, propertyType]);

  const filteredListings = listings.filter((listing) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      listing.title.toLowerCase().includes(query) ||
      listing.address.toLowerCase().includes(query) ||
      listing.neighborhood.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Demo Mode Banner */}
        {isDemoMode && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Demo Mode</p>
              <p className="text-sm text-amber-600">Showing sample commercial listings.</p>
            </div>
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-surface-900">Commercial Real Estate</h1>
          <p className="text-surface-600 mt-1">
            Find office, retail, warehouse, and restaurant spaces in NYC
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
            <Input
              placeholder="Search by name, address, neighborhood..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={borough} onValueChange={setBorough}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Borough" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Boroughs</SelectItem>
              <SelectItem value="Manhattan">Manhattan</SelectItem>
              <SelectItem value="Brooklyn">Brooklyn</SelectItem>
              <SelectItem value="Queens">Queens</SelectItem>
              <SelectItem value="Bronx">Bronx</SelectItem>
            </SelectContent>
          </Select>

          <Select value={propertyType} onValueChange={setPropertyType}>
            <SelectTrigger className="w-40">
              <Building2 className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="OFFICE">Office</SelectItem>
              <SelectItem value="RETAIL">Retail</SelectItem>
              <SelectItem value="WAREHOUSE">Warehouse</SelectItem>
              <SelectItem value="RESTAURANT">Restaurant</SelectItem>
              <SelectItem value="MEDICAL">Medical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
          </div>
        ) : filteredListings.length > 0 ? (
          <>
            <p className="text-sm text-surface-500 mb-4">
              {filteredListings.length} commercial {filteredListings.length === 1 ? 'space' : 'spaces'} available
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              {filteredListings.map((listing) => (
                <CommercialListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </>
        ) : (
          <Card className="py-16">
            <div className="text-center">
              <Building2 className="h-16 w-16 text-surface-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-surface-900 mb-2">
                No Commercial Spaces Found
              </h2>
              <p className="text-surface-600 mb-6">
                Try adjusting your filters or search terms.
              </p>
              <Button variant="outline" onClick={() => {
                setBorough('all');
                setPropertyType('all');
                setSearchQuery('');
              }}>
                Clear Filters
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
