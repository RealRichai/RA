'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Heart,
  Share2,
  MapPin,
  Bed,
  Bath,
  Square,
  Calendar,
  Clock,
  CheckCircle,
  Shield,
  Building2,
  PawPrint,
  Car,
  Wifi,
  Waves,
  Dumbbell,
  Phone,
  Mail,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, FareActBadge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { useListing, useFareActDisclosure, useScheduleTour, useSaveListing, useUnsaveListing, useSavedListings } from '@/hooks';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toaster';

const amenityIcons: Record<string, React.ElementType> = {
  'Parking': Car,
  'Gym': Dumbbell,
  'Pool': Waves,
  'WiFi': Wifi,
  'Pet Friendly': PawPrint,
  'Doorman': Building2,
};

const mockListing = {
  id: '1',
  title: 'Stunning 2BR with Manhattan Skyline Views',
  description: `This beautiful sun-drenched apartment features floor-to-ceiling windows with breathtaking Manhattan skyline views. The open-concept living space flows seamlessly into a modern kitchen with stainless steel appliances, quartz countertops, and custom cabinetry.

The primary bedroom offers ample closet space and city views, while the second bedroom is perfect for a home office or guest room. Hardwood floors throughout, central AC, and in-unit washer/dryer complete this exceptional home.

Building amenities include 24-hour doorman, fitness center, rooftop terrace with BBQ grills, children's playroom, and bike storage. Located steps from the Bedford Ave L train, with easy access to Manhattan and surrounded by Williamsburg's best restaurants, cafes, and shops.`,
  propertyType: 'APARTMENT',
  status: 'ACTIVE',
  price: 3500,
  bedrooms: 2,
  bathrooms: 1,
  squareFeet: 950,
  address: {
    street: '123 Bedford Ave',
    unit: '4B',
    city: 'Brooklyn',
    state: 'NY',
    zipCode: '11211',
    latitude: 40.7193,
    longitude: -73.9570,
  },
  neighborhood: 'Williamsburg',
  borough: 'Brooklyn',
  amenities: ['Dishwasher', 'In-Unit Laundry', 'Central AC', 'Hardwood Floors', 'Doorman', 'Gym', 'Roof Deck', 'Bike Storage', 'Storage Unit'],
  photos: [],
  availableDate: '2025-01-15',
  leaseTermMonths: 12,
  petsAllowed: true,
  petPolicy: 'Cats and small dogs allowed with $500 pet deposit',
  applicationFee: 20,
  securityDeposit: 3500,
  brokerFeePaidBy: 'LANDLORD' as const,
  moveInCosts: {
    firstMonth: 3500,
    securityDeposit: 3500,
    brokerFee: 0,
    applicationFee: 20,
    total: 7020,
  },
  fareActCompliant: true,
  landlordId: 'landlord1',
  landlord: {
    id: 'landlord1',
    firstName: 'Michael',
    lastName: 'Chen',
    avatarUrl: undefined,
  },
  agentId: 'agent1',
  agent: {
    id: 'agent1',
    firstName: 'Sarah',
    lastName: 'Johnson',
    phone: '(212) 555-1234',
    email: 'sarah.johnson@realriches.com',
    avatarUrl: undefined,
  },
  createdAt: '2024-12-10T10:00:00Z',
  updatedAt: '2024-12-10T10:00:00Z',
};

function ImageGallery({ photos }: { photos: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const hasPhotos = photos.length > 0;

  return (
    <div className="relative">
      <div className="aspect-[16/9] md:aspect-[21/9] bg-surface-100 rounded-2xl overflow-hidden">
        {hasPhotos ? (
          <img src={photos[currentIndex]} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-luxury-bronze/20 to-luxury-gold/20 flex items-center justify-center">
            <Building2 className="h-20 w-20 text-luxury-bronze/40" />
          </div>
        )}
      </div>
      {hasPhotos && photos.length > 1 && (
        <>
          <button
            onClick={() => setCurrentIndex((i) => (i === 0 ? photos.length - 1 : i - 1))}
            className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCurrentIndex((i) => (i === photos.length - 1 ? 0 : i + 1))}
            className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={cn('h-2 w-2 rounded-full transition-colors', i === currentIndex ? 'bg-white' : 'bg-white/50')}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FareActDisclosureCard({ listing }: { listing: typeof mockListing }) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-emerald-600" />
          <CardTitle className="text-lg text-emerald-800">FARE Act Fee Disclosure</CardTitle>
        </div>
        <p className="text-sm text-emerald-700">
          This listing complies with NYC Local Law 18 of 2024
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-emerald-700">Application Fee</p>
            <p className="text-lg font-semibold text-emerald-900">{formatCurrency(listing.applicationFee)}</p>
            <p className="text-xs text-emerald-600">Capped at $20 by law</p>
          </div>
          <div>
            <p className="text-sm text-emerald-700">Security Deposit</p>
            <p className="text-lg font-semibold text-emerald-900">{formatCurrency(listing.securityDeposit)}</p>
            <p className="text-xs text-emerald-600">Max 1 month's rent</p>
          </div>
        </div>
        <div className="pt-4 border-t border-emerald-200">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-800">Broker Fee Paid By: {listing.brokerFeePaidBy === 'LANDLORD' ? 'Landlord' : 'Tenant'}</span>
          </div>
          {listing.brokerFeePaidBy === 'LANDLORD' && (
            <p className="text-sm text-emerald-700">No broker fee for tenants on this listing.</p>
          )}
        </div>
        <div className="pt-4 border-t border-emerald-200">
          <p className="text-sm font-medium text-emerald-800 mb-2">Total Move-In Cost</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-emerald-700">First Month's Rent</span>
              <span className="text-emerald-900">{formatCurrency(listing.moveInCosts.firstMonth)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-700">Security Deposit</span>
              <span className="text-emerald-900">{formatCurrency(listing.moveInCosts.securityDeposit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-700">Application Fee</span>
              <span className="text-emerald-900">{formatCurrency(listing.moveInCosts.applicationFee)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-emerald-200 font-semibold">
              <span className="text-emerald-800">Total</span>
              <span className="text-emerald-900">{formatCurrency(listing.moveInCosts.total)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScheduleTourDialog({ listingId, listingTitle }: { listingId: string; listingTitle: string }) {
  const [open, setOpen] = useState(false);
  const [tourType, setTourType] = useState<'SELF_GUIDED' | 'AGENT_LED'>('SELF_GUIDED');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const scheduleTour = useScheduleTour(listingId);

  const handleSubmit = () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/listings/${listingId}`);
      return;
    }
    if (!date || !time) {
      toast({ title: 'Please select a date and time', variant: 'warning' });
      return;
    }
    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    scheduleTour.mutate({ type: tourType, scheduledAt }, {
      onSuccess: () => setOpen(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full">
          <Calendar className="h-5 w-5 mr-2" />
          Schedule a Tour
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a Tour</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <FormField label="Tour Type">
            <Select value={tourType} onValueChange={(v) => setTourType(v as typeof tourType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SELF_GUIDED">
                  <div className="flex flex-col items-start">
                    <span>Self-Guided Tour</span>
                    <span className="text-xs text-surface-500">Access with smart lock code</span>
                  </div>
                </SelectItem>
                <SelectItem value="AGENT_LED">
                  <div className="flex flex-col items-start">
                    <span>Agent-Led Tour</span>
                    <span className="text-xs text-surface-500">Meet with a licensed agent</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Preferred Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
          </FormField>
          <FormField label="Preferred Time" required>
            <Select value={time} onValueChange={setTime}>
              <SelectTrigger>
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                {['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map((t) => (
                  <SelectItem key={t} value={t}>{t.replace(':00', ':00 ' + (parseInt(t) < 12 ? 'AM' : 'PM'))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {tourType === 'SELF_GUIDED' && (
            <div className="p-4 bg-blue-50 rounded-xl text-sm text-blue-800">
              <p className="font-medium mb-1">How Self-Guided Tours Work</p>
              <p>You'll receive a unique access code valid for your scheduled time slot. Valid ID verification is required before your tour.</p>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="flex-1" onClick={handleSubmit} loading={scheduleTour.isPending}>
            {isAuthenticated ? 'Confirm Tour' : 'Log in to Schedule'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;
  const { isAuthenticated } = useAuthStore();
  
  const listing = mockListing;
  const isLoading = false;

  const { data: savedListings } = useSavedListings();
  const saveMutation = useSaveListing();
  const unsaveMutation = useUnsaveListing();
  const isSaved = savedListings?.some((l) => l.id === listingId) ?? false;

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: listing.title, url: window.location.href });
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: 'Link copied to clipboard', variant: 'success' });
    }
  };

  const handleToggleSave = () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/listings/${listingId}`);
      return;
    }
    if (isSaved) {
      unsaveMutation.mutate(listingId);
    } else {
      saveMutation.mutate(listingId);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="container-wide py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-surface-200 rounded" />
            <div className="aspect-[21/9] bg-surface-200 rounded-2xl" />
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <div className="h-10 bg-surface-200 rounded w-3/4" />
                <div className="h-6 bg-surface-200 rounded w-1/2" />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />
      <main className="container-wide py-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to listings
        </button>

        <ImageGallery photos={listing.photos} />

        <div className="grid lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2 space-y-8">
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {listing.fareActCompliant && <FareActBadge compliant />}
                {listing.petsAllowed && <Badge variant="info">Pet Friendly</Badge>}
                <Badge variant="success">Available {formatDate(listing.availableDate)}</Badge>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl md:text-4xl font-display font-bold text-surface-900 mb-2">{listing.title}</h1>
                  <div className="flex items-center gap-2 text-surface-600">
                    <MapPin className="h-5 w-5" />
                    <span>{listing.address.street}{listing.address.unit ? `, ${listing.address.unit}` : ''}, {listing.neighborhood}, {listing.borough}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={handleShare}><Share2 className="h-5 w-5" /></Button>
                  <Button variant={isSaved ? 'default' : 'outline'} size="icon" onClick={handleToggleSave}>
                    <Heart className={cn('h-5 w-5', isSaved && 'fill-current')} />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-display font-bold text-surface-900">{formatCurrency(listing.price)}</span>
              <span className="text-lg text-surface-500">/month</span>
            </div>

            <div className="flex flex-wrap gap-6 py-6 border-y border-surface-200">
              <div className="flex items-center gap-2">
                <Bed className="h-5 w-5 text-surface-500" />
                <span className="font-medium">{listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} Bedrooms`}</span>
              </div>
              <div className="flex items-center gap-2">
                <Bath className="h-5 w-5 text-surface-500" />
                <span className="font-medium">{listing.bathrooms} Bathroom{listing.bathrooms > 1 ? 's' : ''}</span>
              </div>
              {listing.squareFeet && (
                <div className="flex items-center gap-2">
                  <Square className="h-5 w-5 text-surface-500" />
                  <span className="font-medium">{listing.squareFeet} sq ft</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-surface-500" />
                <span className="font-medium">{listing.leaseTermMonths} Month Lease</span>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-surface-900 mb-4">About This Property</h2>
              <div className="prose prose-surface max-w-none">
                {listing.description.split('\n\n').map((p, i) => <p key={i} className="text-surface-600 mb-4">{p}</p>)}
              </div>
            </div>

            <div>
              <h2 className="text-xl font-display font-semibold text-surface-900 mb-4">Amenities</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {listing.amenities.map((amenity) => {
                  const Icon = amenityIcons[amenity] || CheckCircle;
                  return (
                    <div key={amenity} className="flex items-center gap-2 p-3 rounded-xl bg-surface-50">
                      <Icon className="h-5 w-5 text-luxury-bronze" />
                      <span className="text-sm font-medium text-surface-700">{amenity}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {listing.petsAllowed && listing.petPolicy && (
              <div>
                <h2 className="text-xl font-display font-semibold text-surface-900 mb-4">Pet Policy</h2>
                <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50">
                  <PawPrint className="h-5 w-5 text-blue-600 mt-0.5" />
                  <p className="text-blue-800">{listing.petPolicy}</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <Card className="sticky top-24">
              <CardContent className="p-6 space-y-6">
                <ScheduleTourDialog listingId={listing.id} listingTitle={listing.title} />
                <Button variant="outline" size="lg" className="w-full" asChild>
                  <Link href={`/listings/${listing.id}/apply`}>Apply Now</Link>
                </Button>
                {listing.agent && (
                  <div className="pt-6 border-t border-surface-100">
                    <p className="text-sm text-surface-500 mb-3">Listed by</p>
                    <div className="flex items-center gap-3 mb-4">
                      <UserAvatar user={listing.agent} size="lg" />
                      <div>
                        <p className="font-semibold text-surface-900">{listing.agent.firstName} {listing.agent.lastName}</p>
                        <p className="text-sm text-surface-500">Licensed Agent</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <a href={`tel:${listing.agent.phone}`} className="flex items-center gap-2 text-sm text-surface-600 hover:text-surface-900">
                        <Phone className="h-4 w-4" />{listing.agent.phone}
                      </a>
                      <a href={`mailto:${listing.agent.email}`} className="flex items-center gap-2 text-sm text-surface-600 hover:text-surface-900">
                        <Mail className="h-4 w-4" />{listing.agent.email}
                      </a>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <FareActDisclosureCard listing={listing} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
