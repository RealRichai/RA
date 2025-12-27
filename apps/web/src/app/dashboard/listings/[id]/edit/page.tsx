'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  MapPin,
  DollarSign,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  Home,
  Bed,
  Bath,
  Square,
  Calendar,
  PawPrint,
  Shield,
  Upload,
  X,
  Info,
  Sparkles,
  Loader2,
  Save,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { useRequireAuth, useListing, useUpdateListing, useDeleteListing } from '@/hooks';
import { useAuthStore, isLandlord, isAgent } from '@/stores/auth';
import { toast } from '@/components/ui/toaster';
import type { Listing } from '@/lib/api';

// =============================================================================
// CONSTANTS & TYPES (duplicated from new/page.tsx - would ideally be shared)
// =============================================================================

const STEPS = [
  { id: 1, title: 'Property Details', icon: Building2 },
  { id: 2, title: 'Location', icon: MapPin },
  { id: 3, title: 'Amenities', icon: Home },
  { id: 4, title: 'Photos', icon: ImageIcon },
  { id: 5, title: 'Pricing & Fees', icon: DollarSign },
  { id: 6, title: 'Review & Save', icon: CheckCircle },
];

const PROPERTY_TYPES = [
  { value: 'APARTMENT', label: 'Apartment', icon: Building2 },
  { value: 'STUDIO', label: 'Studio', icon: Home },
  { value: 'CONDO', label: 'Condo', icon: Building2 },
  { value: 'TOWNHOUSE', label: 'Townhouse', icon: Home },
  { value: 'HOUSE', label: 'House', icon: Home },
  { value: 'LOFT', label: 'Loft', icon: Building2 },
] as const;

const NYC_BOROUGHS = [
  { value: 'manhattan', label: 'Manhattan' },
  { value: 'brooklyn', label: 'Brooklyn' },
  { value: 'queens', label: 'Queens' },
  { value: 'bronx', label: 'Bronx' },
  { value: 'staten_island', label: 'Staten Island' },
] as const;

const LONG_ISLAND_COUNTIES = [
  { value: 'nassau', label: 'Nassau County' },
  { value: 'suffolk', label: 'Suffolk County' },
] as const;

const MANHATTAN_NEIGHBORHOODS = [
  'Upper East Side', 'Upper West Side', 'Midtown', 'Chelsea', 'Greenwich Village',
  'SoHo', 'Tribeca', 'Financial District', 'Harlem', 'East Village',
  'Lower East Side', 'Murray Hill', 'Gramercy', 'Hell\'s Kitchen', 'Battery Park City',
];

const BROOKLYN_NEIGHBORHOODS = [
  'Williamsburg', 'Brooklyn Heights', 'DUMBO', 'Park Slope', 'Cobble Hill',
  'Carroll Gardens', 'Bushwick', 'Bedford-Stuyvesant', 'Crown Heights', 'Greenpoint',
  'Fort Greene', 'Prospect Heights', 'Flatbush', 'Bay Ridge', 'Sunset Park',
];

const QUEENS_NEIGHBORHOODS = [
  'Astoria', 'Long Island City', 'Flushing', 'Jackson Heights', 'Forest Hills',
  'Sunnyside', 'Ridgewood', 'Jamaica', 'Bayside', 'Rego Park',
];

const AMENITIES_CATEGORIES = {
  building: {
    label: 'Building',
    items: [
      { id: 'doorman', label: 'Doorman', premium: true },
      { id: 'elevator', label: 'Elevator' },
      { id: 'laundry_building', label: 'Laundry in Building' },
      { id: 'gym', label: 'Gym', premium: true },
      { id: 'roof_deck', label: 'Roof Deck', premium: true },
      { id: 'parking', label: 'Parking Available' },
      { id: 'bike_storage', label: 'Bike Storage' },
      { id: 'package_room', label: 'Package Room' },
      { id: 'concierge', label: 'Concierge', premium: true },
      { id: 'live_in_super', label: 'Live-in Super' },
    ],
  },
  unit: {
    label: 'In-Unit',
    items: [
      { id: 'washer_dryer', label: 'Washer/Dryer in Unit', premium: true },
      { id: 'dishwasher', label: 'Dishwasher' },
      { id: 'central_ac', label: 'Central A/C', premium: true },
      { id: 'hardwood_floors', label: 'Hardwood Floors' },
      { id: 'high_ceilings', label: 'High Ceilings', premium: true },
      { id: 'exposed_brick', label: 'Exposed Brick' },
      { id: 'private_outdoor', label: 'Private Outdoor Space', premium: true },
      { id: 'fireplace', label: 'Fireplace', premium: true },
      { id: 'walk_in_closet', label: 'Walk-in Closet' },
      { id: 'natural_light', label: 'Abundant Natural Light' },
    ],
  },
  views: {
    label: 'Views & Location',
    items: [
      { id: 'city_view', label: 'City View', premium: true },
      { id: 'water_view', label: 'Water View', premium: true },
      { id: 'park_view', label: 'Park View', premium: true },
      { id: 'corner_unit', label: 'Corner Unit' },
      { id: 'top_floor', label: 'Top Floor' },
      { id: 'near_subway', label: 'Near Subway' },
      { id: 'near_park', label: 'Near Park' },
    ],
  },
};

const FARE_ACT_MAX_APPLICATION_FEE = 20;
const FARE_ACT_MAX_SECURITY_DEPOSIT_MONTHS = 1;

interface FormState {
  title: string;
  description: string;
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zipCode: string;
  borough: string;
  neighborhood: string;
  market: 'nyc' | 'long_island';
  amenities: string[];
  price: string;
  securityDeposit: string;
  applicationFee: string;
  brokerFee: string;
  brokerFeePaidBy: 'LANDLORD' | 'TENANT';
  availableDate: string;
  leaseTermMonths: string;
  petsAllowed: boolean;
  petPolicy: string;
}

interface PhotoFile {
  id: string;
  file?: File;
  preview: string;
  url?: string; // For existing photos
  uploading: boolean;
  isExisting: boolean;
  error?: string;
}

// =============================================================================
// HELPER: Convert Listing to FormState
// =============================================================================

function listingToFormState(listing: Listing): FormState {
  // Determine market based on borough/city
  const nycBoroughs = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten_island'];
  const isNYC = listing.borough && nycBoroughs.includes(listing.borough.toLowerCase().replace(' ', '_'));

  return {
    title: listing.title || '',
    description: listing.description || '',
    propertyType: listing.propertyType || '',
    bedrooms: String(listing.bedrooms ?? ''),
    bathrooms: String(listing.bathrooms ?? ''),
    squareFeet: listing.squareFeet ? String(listing.squareFeet) : '',
    street: listing.address?.street || '',
    unit: listing.address?.unit || '',
    city: listing.address?.city || '',
    state: listing.address?.state || 'NY',
    zipCode: listing.address?.zipCode || '',
    borough: listing.borough?.toLowerCase().replace(' ', '_') || '',
    neighborhood: listing.neighborhood || '',
    market: isNYC ? 'nyc' : 'long_island',
    amenities: listing.amenities || [],
    price: listing.price ? String(listing.price) : '',
    securityDeposit: listing.securityDeposit ? String(listing.securityDeposit) : '',
    applicationFee: listing.applicationFee ? String(listing.applicationFee) : '',
    brokerFee: listing.brokerFee ? String(listing.brokerFee) : '',
    brokerFeePaidBy: listing.brokerFeePaidBy || 'LANDLORD',
    availableDate: listing.availableDate?.split('T')[0] || '',
    leaseTermMonths: listing.leaseTermMonths ? String(listing.leaseTermMonths) : '12',
    petsAllowed: listing.petsAllowed ?? false,
    petPolicy: listing.petPolicy || '',
  };
}

function listingToPhotos(listing: Listing): PhotoFile[] {
  return (listing.photos || []).map((url, index) => ({
    id: `existing-${index}`,
    preview: url,
    url,
    uploading: false,
    isExisting: true,
  }));
}

// =============================================================================
// FARE ACT COMPLIANCE CALCULATOR
// =============================================================================

function useFareActCompliance(formData: FormState) {
  return useMemo(() => {
    const isNYC = formData.market === 'nyc';
    const price = parseFloat(formData.price) || 0;
    const securityDeposit = parseFloat(formData.securityDeposit) || 0;
    const applicationFee = parseFloat(formData.applicationFee) || 0;
    const brokerFee = parseFloat(formData.brokerFee) || 0;

    const violations: { field: string; message: string; severity: 'error' | 'warning' }[] = [];

    if (isNYC) {
      if (applicationFee > FARE_ACT_MAX_APPLICATION_FEE) {
        violations.push({
          field: 'applicationFee',
          message: `Application fee exceeds FARE Act cap of $${FARE_ACT_MAX_APPLICATION_FEE}`,
          severity: 'error',
        });
      }

      if (securityDeposit > price) {
        violations.push({
          field: 'securityDeposit',
          message: 'Security deposit exceeds FARE Act limit of 1 month\'s rent',
          severity: 'error',
        });
      }

      if (formData.brokerFeePaidBy === 'TENANT' && brokerFee > 0) {
        violations.push({
          field: 'brokerFeePaidBy',
          message: 'Under FARE Act, broker fees are paid by the party who engaged the broker (typically landlord)',
          severity: 'warning',
        });
      }
    }

    const landlordBrokerFee = formData.brokerFeePaidBy === 'LANDLORD' ? brokerFee : 0;
    const tenantBrokerFee = formData.brokerFeePaidBy === 'TENANT' ? brokerFee : 0;

    const moveInCosts = {
      firstMonth: price,
      securityDeposit: Math.min(securityDeposit, isNYC ? price : securityDeposit),
      brokerFee: tenantBrokerFee,
      applicationFee: Math.min(applicationFee, isNYC ? FARE_ACT_MAX_APPLICATION_FEE : applicationFee),
      total: 0,
    };
    moveInCosts.total = moveInCosts.firstMonth + moveInCosts.securityDeposit + moveInCosts.brokerFee + moveInCosts.applicationFee;

    return {
      isCompliant: violations.filter(v => v.severity === 'error').length === 0,
      violations,
      isNYC,
      moveInCosts,
      landlordBrokerFee,
    };
  }, [formData]);
}

// =============================================================================
// MAIN EDIT PAGE COMPONENT
// =============================================================================

export default function EditListingPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;
  
  const { isLoading: authLoading } = useRequireAuth();
  const { user } = useAuthStore();
  const { data: listing, isLoading: listingLoading, error: listingError } = useListing(listingId);
  const { mutate: updateListing, isPending: isUpdating } = useUpdateListing(listingId);
  const { mutate: deleteListing, isPending: isDeleting } = useDeleteListing(listingId);

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormState | null>(null);
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Initialize form data from listing
  useEffect(() => {
    if (listing && !formData) {
      setFormData(listingToFormState(listing));
      setPhotos(listingToPhotos(listing));
    }
  }, [listing, formData]);

  const fareActCompliance = useFareActCompliance(formData || {} as FormState);

  const updateField = useCallback((field: keyof FormState, value: any) => {
    setFormData((prev) => prev ? { ...prev, [field]: value } : prev);
    setHasUnsavedChanges(true);
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [errors]);

  const toggleAmenity = useCallback((amenityId: string) => {
    setFormData((prev) => {
      if (!prev) return prev;
      const amenities = prev.amenities.includes(amenityId)
        ? prev.amenities.filter((a) => a !== amenityId)
        : [...prev.amenities, amenityId];
      return { ...prev, amenities };
    });
    setHasUnsavedChanges(true);
  }, []);

  // Validation
  const validateStep = useCallback((step: number): boolean => {
    if (!formData) return false;
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 1:
        if (!formData.title.trim()) newErrors.title = 'Title is required';
        if (!formData.description.trim()) newErrors.description = 'Description is required';
        if (!formData.propertyType) newErrors.propertyType = 'Property type is required';
        if (!formData.bedrooms) newErrors.bedrooms = 'Bedrooms required';
        if (!formData.bathrooms) newErrors.bathrooms = 'Bathrooms required';
        break;
      case 2:
        if (!formData.street.trim()) newErrors.street = 'Street address is required';
        if (!formData.city.trim()) newErrors.city = 'City is required';
        if (!formData.zipCode.trim()) newErrors.zipCode = 'ZIP code is required';
        if (formData.market === 'nyc' && !formData.borough) newErrors.borough = 'Borough is required';
        break;
      case 4:
        if (photos.length < 1) newErrors.photos = 'At least 1 photo is required';
        break;
      case 5:
        if (!formData.price || parseFloat(formData.price) <= 0) newErrors.price = 'Valid rent amount required';
        if (!formData.availableDate) newErrors.availableDate = 'Available date is required';
        if (!fareActCompliance.isCompliant) {
          fareActCompliance.violations.forEach((v) => {
            if (v.severity === 'error') newErrors[v.field] = v.message;
          });
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, photos, fareActCompliance]);

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSave = async (publish = false) => {
    if (!formData) return;
    
    // Validate all steps
    let isValid = true;
    for (let step = 1; step <= 5; step++) {
      if (!validateStep(step)) {
        setCurrentStep(step);
        isValid = false;
        break;
      }
    }

    if (!isValid) {
      toast({ title: 'Please fix all errors before saving', variant: 'error' });
      return;
    }

    const payload = {
      title: formData.title,
      description: formData.description,
      propertyType: formData.propertyType,
      price: parseFloat(formData.price),
      bedrooms: parseInt(formData.bedrooms),
      bathrooms: parseFloat(formData.bathrooms),
      squareFeet: formData.squareFeet ? parseInt(formData.squareFeet) : undefined,
      address: {
        street: formData.street,
        unit: formData.unit || undefined,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
      },
      neighborhood: formData.neighborhood || undefined,
      amenities: formData.amenities,
      availableDate: formData.availableDate,
      leaseTermMonths: parseInt(formData.leaseTermMonths) || 12,
      petsAllowed: formData.petsAllowed,
      petPolicy: formData.petPolicy || undefined,
      // Note: Photo URLs would be handled separately via upload
    };

    updateListing(payload, {
      onSuccess: () => {
        setHasUnsavedChanges(false);
        toast({ title: 'Listing saved successfully', variant: 'success' });
        if (publish) {
          router.push(`/listings/${listingId}`);
        }
      },
      onError: (error: any) => {
        toast({ title: 'Failed to save listing', description: error.message, variant: 'error' });
      },
    });
  };

  const handleDelete = () => {
    deleteListing(undefined, {
      onSuccess: () => {
        toast({ title: 'Listing deleted', variant: 'success' });
        router.push('/dashboard/listings');
      },
      onError: () => {
        toast({ title: 'Failed to delete listing', variant: 'error' });
      },
    });
  };

  // Photo handlers
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;

    const newPhotos: PhotoFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'File too large', description: `${file.name} exceeds 10MB limit`, variant: 'error' });
        continue;
      }

      newPhotos.push({
        id: `new-${Date.now()}-${i}`,
        file,
        preview: URL.createObjectURL(file),
        uploading: false,
        isExisting: false,
      });
    }

    setPhotos((prev) => [...prev, ...newPhotos]);
    setHasUnsavedChanges(true);
  }, []);

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo && !photo.isExisting) URL.revokeObjectURL(photo.preview);
      return prev.filter((p) => p.id !== id);
    });
    setHasUnsavedChanges(true);
  };

  const movePhoto = (id: string, direction: 'up' | 'down') => {
    setPhotos((prev) => {
      const index = prev.findIndex((p) => p.id === id);
      if (index === -1) return prev;
      if (direction === 'up' && index === 0) return prev;
      if (direction === 'down' && index === prev.length - 1) return prev;

      const newPhotos = [...prev];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      [newPhotos[index], newPhotos[swapIndex]] = [newPhotos[swapIndex], newPhotos[index]];
      return newPhotos;
    });
    setHasUnsavedChanges(true);
  };

  // Loading states
  if (authLoading || listingLoading) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
      </div>
    );
  }

  if (listingError || !listing) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-surface-900 mb-2">Listing Not Found</h1>
          <p className="text-surface-600 mb-6">The listing you're trying to edit doesn't exist or you don't have permission to edit it.</p>
          <Button onClick={() => router.push('/dashboard/listings')}>
            Back to My Listings
          </Button>
        </div>
      </div>
    );
  }

  // Access control
  if (user && !isLandlord(user) && !isAgent(user)) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <Shield className="h-16 w-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-surface-900 mb-2">Access Restricted</h1>
          <p className="text-surface-600 mb-6">Only landlords and agents can edit listings.</p>
          <Button onClick={() => router.push('/dashboard')}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (!formData) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
      </div>
    );
  }

  const neighborhoods = (() => {
    if (formData.market === 'long_island') return [];
    switch (formData.borough) {
      case 'manhattan': return MANHATTAN_NEIGHBORHOODS;
      case 'brooklyn': return BROOKLYN_NEIGHBORHOODS;
      case 'queens': return QUEENS_NEIGHBORHOODS;
      default: return [];
    }
  })();

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/listings"
            className="inline-flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to My Listings
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-surface-900">Edit Listing</h1>
              <p className="text-surface-600 mt-1">
                Update your property listing details
              </p>
            </div>
            <div className="flex items-center gap-3">
              {hasUnsavedChanges && (
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                  Unsaved changes
                </Badge>
              )}
              <Badge variant={listing.status === 'ACTIVE' ? 'success' : 'default'}>
                {listing.status}
              </Badge>
            </div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-surface-200" />
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isCompleted = currentStep > step.id;
              const isCurrent = currentStep === step.id;
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(step.id)}
                  className="relative flex flex-col items-center gap-2 z-10"
                >
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                      isCompleted
                        ? 'bg-luxury-gold text-white'
                        : isCurrent
                          ? 'bg-luxury-bronze text-white'
                          : 'bg-surface-200 text-surface-500'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium hidden md:block',
                      isCurrent ? 'text-luxury-bronze' : 'text-surface-500'
                    )}
                  >
                    {step.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
            <CardDescription>
              {currentStep === 1 && 'Basic information about your property'}
              {currentStep === 2 && 'Where is your property located?'}
              {currentStep === 3 && 'What features does your property have?'}
              {currentStep === 4 && 'Add photos of your property'}
              {currentStep === 5 && 'Set your pricing and fees'}
              {currentStep === 6 && 'Review and save your changes'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Step 1: Property Details */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <FormField label="Listing Title" error={errors.title} required>
                  <Input
                    placeholder="e.g., Stunning 2BR with Manhattan Skyline Views"
                    value={formData.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    error={errors.title}
                  />
                </FormField>

                <FormField label="Property Type" error={errors.propertyType} required>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {PROPERTY_TYPES.map((type) => {
                      const Icon = type.icon;
                      const selected = formData.propertyType === type.value;
                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => updateField('propertyType', type.value)}
                          className={cn(
                            'flex items-center gap-3 p-4 rounded-xl border-2 transition-all',
                            selected
                              ? 'border-luxury-gold bg-luxury-champagne/20 text-luxury-bronze'
                              : 'border-surface-200 hover:border-surface-300 text-surface-700'
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="font-medium">{type.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </FormField>

                <FormField label="Description" error={errors.description} required>
                  <textarea
                    className={cn(
                      'flex w-full rounded-xl border border-surface-200 bg-white px-4 py-3 text-base',
                      'placeholder:text-surface-400 focus-visible:outline-none focus-visible:ring-2',
                      'focus-visible:ring-luxury-gold focus-visible:border-transparent min-h-[150px] resize-y',
                      errors.description && 'border-red-500'
                    )}
                    placeholder="Describe your property's best features..."
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                  />
                </FormField>

                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Bedrooms" error={errors.bedrooms} required>
                    <Select value={formData.bedrooms} onValueChange={(v) => updateField('bedrooms', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Studio</SelectItem>
                        <SelectItem value="1">1 Bedroom</SelectItem>
                        <SelectItem value="2">2 Bedrooms</SelectItem>
                        <SelectItem value="3">3 Bedrooms</SelectItem>
                        <SelectItem value="4">4 Bedrooms</SelectItem>
                        <SelectItem value="5">5+ Bedrooms</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="Bathrooms" error={errors.bathrooms} required>
                    <Select value={formData.bathrooms} onValueChange={(v) => updateField('bathrooms', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Bath</SelectItem>
                        <SelectItem value="1.5">1.5 Baths</SelectItem>
                        <SelectItem value="2">2 Baths</SelectItem>
                        <SelectItem value="2.5">2.5 Baths</SelectItem>
                        <SelectItem value="3">3+ Baths</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="Square Feet">
                    <Input
                      type="number"
                      placeholder="1,200"
                      value={formData.squareFeet}
                      onChange={(e) => updateField('squareFeet', e.target.value)}
                    />
                  </FormField>
                </div>
              </div>
            )}

            {/* Step 2: Location */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <FormField label="Market" error={errors.market} required>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { value: 'nyc', label: 'New York City', sublabel: 'FARE Act applies' },
                      { value: 'long_island', label: 'Long Island', sublabel: 'Traditional fees' },
                    ].map((market) => (
                      <button
                        key={market.value}
                        type="button"
                        onClick={() => {
                          updateField('market', market.value);
                          updateField('borough', '');
                          updateField('neighborhood', '');
                        }}
                        className={cn(
                          'p-4 rounded-xl border-2 text-left transition-all',
                          formData.market === market.value
                            ? 'border-luxury-gold bg-luxury-champagne/20'
                            : 'border-surface-200 hover:border-surface-300'
                        )}
                      >
                        <span className="font-medium">{market.label}</span>
                        <span className="block text-sm text-surface-500 mt-1">{market.sublabel}</span>
                      </button>
                    ))}
                  </div>
                </FormField>

                {formData.market === 'nyc' && (
                  <FormField label="Borough" error={errors.borough} required>
                    <Select value={formData.borough} onValueChange={(v) => updateField('borough', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select borough" />
                      </SelectTrigger>
                      <SelectContent>
                        {NYC_BOROUGHS.map((borough) => (
                          <SelectItem key={borough.value} value={borough.value}>
                            {borough.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}

                {formData.market === 'long_island' && (
                  <FormField label="County" error={errors.borough} required>
                    <Select value={formData.borough} onValueChange={(v) => updateField('borough', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select county" />
                      </SelectTrigger>
                      <SelectContent>
                        {LONG_ISLAND_COUNTIES.map((county) => (
                          <SelectItem key={county.value} value={county.value}>
                            {county.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}

                {neighborhoods.length > 0 && (
                  <FormField label="Neighborhood">
                    <Select value={formData.neighborhood} onValueChange={(v) => updateField('neighborhood', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select neighborhood" />
                      </SelectTrigger>
                      <SelectContent>
                        {neighborhoods.map((n) => (
                          <SelectItem key={n} value={n}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}

                <FormField label="Street Address" error={errors.street} required>
                  <Input
                    placeholder="123 Main Street"
                    value={formData.street}
                    onChange={(e) => updateField('street', e.target.value)}
                    error={errors.street}
                  />
                </FormField>

                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Unit/Apt">
                    <Input
                      placeholder="4A"
                      value={formData.unit}
                      onChange={(e) => updateField('unit', e.target.value)}
                    />
                  </FormField>

                  <FormField label="City" error={errors.city} required>
                    <Input
                      placeholder="New York"
                      value={formData.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      error={errors.city}
                    />
                  </FormField>

                  <FormField label="ZIP Code" error={errors.zipCode} required>
                    <Input
                      placeholder="10001"
                      value={formData.zipCode}
                      onChange={(e) => updateField('zipCode', e.target.value)}
                      error={errors.zipCode}
                    />
                  </FormField>
                </div>

                {formData.market === 'nyc' && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex gap-3">
                      <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-800">NYC FARE Act Notice</p>
                        <p className="text-sm text-amber-700 mt-1">
                          This property is subject to NYC Local Law 18 of 2024 (FARE Act), effective June 11, 2025.
                          Application fees are capped at $20 and security deposits at 1 month's rent.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Amenities */}
            {currentStep === 3 && (
              <div className="space-y-8">
                {Object.entries(AMENITIES_CATEGORIES).map(([key, category]) => (
                  <div key={key}>
                    <h3 className="font-semibold text-surface-900 mb-4">{category.label}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {category.items.map((amenity) => {
                        const isSelected = formData.amenities.includes(amenity.id);
                        return (
                          <button
                            key={amenity.id}
                            type="button"
                            onClick={() => toggleAmenity(amenity.id)}
                            className={cn(
                              'flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left',
                              isSelected
                                ? 'border-luxury-gold bg-luxury-champagne/20'
                                : 'border-surface-200 hover:border-surface-300'
                            )}
                          >
                            <span className={cn('text-sm', isSelected ? 'text-luxury-bronze font-medium' : 'text-surface-700')}>
                              {amenity.label}
                            </span>
                            {amenity.premium && (
                              <Sparkles className="h-4 w-4 text-luxury-gold" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="border-t pt-6">
                  <h3 className="font-semibold text-surface-900 mb-4">Pet Policy</h3>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.petsAllowed}
                      onChange={(e) => updateField('petsAllowed', e.target.checked)}
                      className="w-5 h-5 rounded border-surface-300 text-luxury-gold focus:ring-luxury-gold"
                    />
                    <div className="flex items-center gap-2">
                      <PawPrint className="h-5 w-5 text-surface-500" />
                      <span className="font-medium">Pets Allowed</span>
                    </div>
                  </label>

                  {formData.petsAllowed && (
                    <div className="mt-4">
                      <FormField label="Pet Policy Details">
                        <Input
                          placeholder="e.g., Dogs under 25 lbs, no cats, $500 pet deposit"
                          value={formData.petPolicy}
                          onChange={(e) => updateField('petPolicy', e.target.value)}
                        />
                      </FormField>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Photos */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <p className="text-surface-600">
                    High-quality photos significantly increase interest.
                  </p>
                  <p className="text-sm text-surface-400 mt-1">
                    The first photo will be your listing's cover image.
                  </p>
                </div>

                {errors.photos && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    {errors.photos}
                  </div>
                )}

                <div
                  className={cn(
                    'border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer',
                    'hover:border-luxury-gold hover:bg-luxury-champagne/10'
                  )}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleFileSelect(e.dataTransfer.files);
                  }}
                >
                  <label className="cursor-pointer">
                    <Upload className="h-12 w-12 text-surface-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-surface-700 mb-1">
                      Drop photos here or click to upload
                    </p>
                    <p className="text-sm text-surface-400">
                      JPG, PNG, or WebP up to 10MB each
                    </p>
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e.target.files)}
                    />
                  </label>
                </div>

                {photos.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {photos.map((photo, index) => (
                      <div
                        key={photo.id}
                        className={cn(
                          'relative group aspect-[4/3] rounded-xl overflow-hidden border-2',
                          index === 0 ? 'border-luxury-gold' : 'border-surface-200'
                        )}
                      >
                        <img
                          src={photo.preview}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {index === 0 && (
                          <div className="absolute top-2 left-2">
                            <Badge variant="gold">Cover Photo</Badge>
                          </div>
                        )}
                        {photo.isExisting && (
                          <div className="absolute top-2 right-2">
                            <Badge variant="default" className="text-xs">Existing</Badge>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          {index > 0 && (
                            <Button size="sm" variant="default" onClick={() => movePhoto(photo.id, 'up')}>
                              ←
                            </Button>
                          )}
                          <Button size="sm" variant="destructive" onClick={() => removePhoto(photo.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                          {index < photos.length - 1 && (
                            <Button size="sm" variant="default" onClick={() => movePhoto(photo.id, 'down')}>
                              →
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-4 bg-surface-50 rounded-xl">
                  <p className="text-sm text-surface-600">
                    <strong>{photos.length}</strong> photo{photos.length !== 1 ? 's' : ''}
                    {photos.filter(p => p.isExisting).length > 0 && (
                      <span className="ml-2">
                        ({photos.filter(p => p.isExisting).length} existing, {photos.filter(p => !p.isExisting).length} new)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Step 5: Pricing & Fees */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <FormField label="Monthly Rent" error={errors.price} required>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500">$</span>
                      <Input
                        type="number"
                        placeholder="3,500"
                        value={formData.price}
                        onChange={(e) => updateField('price', e.target.value)}
                        className="pl-8"
                        error={errors.price}
                      />
                    </div>
                  </FormField>

                  <FormField label="Security Deposit" error={errors.securityDeposit}>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500">$</span>
                      <Input
                        type="number"
                        placeholder="3,500"
                        value={formData.securityDeposit}
                        onChange={(e) => updateField('securityDeposit', e.target.value)}
                        className="pl-8"
                        error={errors.securityDeposit}
                      />
                    </div>
                    {formData.market === 'nyc' && (
                      <p className="text-xs text-surface-400 mt-1">
                        FARE Act: Max 1 month's rent ({formatCurrency(parseFloat(formData.price) || 0)})
                      </p>
                    )}
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <FormField label="Application Fee" error={errors.applicationFee}>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500">$</span>
                      <Input
                        type="number"
                        placeholder={formData.market === 'nyc' ? '20' : '50'}
                        value={formData.applicationFee}
                        onChange={(e) => updateField('applicationFee', e.target.value)}
                        className="pl-8"
                        error={errors.applicationFee}
                      />
                    </div>
                    {formData.market === 'nyc' && (
                      <p className="text-xs text-surface-400 mt-1">
                        FARE Act: Max $20
                      </p>
                    )}
                  </FormField>

                  <FormField label="Broker Fee">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500">$</span>
                      <Input
                        type="number"
                        placeholder="0"
                        value={formData.brokerFee}
                        onChange={(e) => updateField('brokerFee', e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </FormField>
                </div>

                {parseFloat(formData.brokerFee) > 0 && (
                  <FormField label="Broker Fee Paid By" error={errors.brokerFeePaidBy}>
                    <div className="grid grid-cols-2 gap-4">
                      {(['LANDLORD', 'TENANT'] as const).map((payer) => (
                        <button
                          key={payer}
                          type="button"
                          onClick={() => updateField('brokerFeePaidBy', payer)}
                          className={cn(
                            'p-4 rounded-xl border-2 text-left transition-all',
                            formData.brokerFeePaidBy === payer
                              ? 'border-luxury-gold bg-luxury-champagne/20'
                              : 'border-surface-200 hover:border-surface-300'
                          )}
                        >
                          <span className="font-medium">{payer === 'LANDLORD' ? 'Landlord' : 'Tenant'}</span>
                          {formData.market === 'nyc' && payer === 'TENANT' && (
                            <span className="block text-xs text-amber-600 mt-1">
                              FARE Act default: Landlord pays
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </FormField>
                )}

                <div className="grid grid-cols-2 gap-6">
                  <FormField label="Available Date" error={errors.availableDate} required>
                    <Input
                      type="date"
                      value={formData.availableDate}
                      onChange={(e) => updateField('availableDate', e.target.value)}
                      error={errors.availableDate}
                    />
                  </FormField>

                  <FormField label="Lease Term">
                    <Select value={formData.leaseTermMonths} onValueChange={(v) => updateField('leaseTermMonths', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select term" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">6 Months</SelectItem>
                        <SelectItem value="12">1 Year</SelectItem>
                        <SelectItem value="18">18 Months</SelectItem>
                        <SelectItem value="24">2 Years</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>

                {/* FARE Act Compliance */}
                {fareActCompliance.violations.length > 0 && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="flex gap-3">
                      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-800">FARE Act Compliance Issues</p>
                        <ul className="text-sm text-red-700 mt-2 space-y-1">
                          {fareActCompliance.violations.map((v, i) => (
                            <li key={i}>• {v.message}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Move-in Cost Preview */}
                <Card className="bg-surface-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Tenant Move-in Cost Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>First Month's Rent</span>
                        <span>{formatCurrency(fareActCompliance.moveInCosts.firstMonth)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Security Deposit</span>
                        <span>{formatCurrency(fareActCompliance.moveInCosts.securityDeposit)}</span>
                      </div>
                      {fareActCompliance.moveInCosts.brokerFee > 0 && (
                        <div className="flex justify-between">
                          <span>Broker Fee</span>
                          <span>{formatCurrency(fareActCompliance.moveInCosts.brokerFee)}</span>
                        </div>
                      )}
                      {fareActCompliance.moveInCosts.applicationFee > 0 && (
                        <div className="flex justify-between">
                          <span>Application Fee</span>
                          <span>{formatCurrency(fareActCompliance.moveInCosts.applicationFee)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold pt-2 border-t">
                        <span>Total Move-in Cost</span>
                        <span className="text-luxury-bronze">{formatCurrency(fareActCompliance.moveInCosts.total)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Step 6: Review */}
            {currentStep === 6 && (
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-50">
                  <div className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center',
                    fareActCompliance.isCompliant ? 'bg-emerald-100' : 'bg-amber-100'
                  )}>
                    {fareActCompliance.isCompliant ? (
                      <CheckCircle className="h-6 w-6 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-6 w-6 text-amber-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-surface-900">
                      {fareActCompliance.isCompliant ? 'FARE Act Compliant' : 'Compliance Issues'}
                    </p>
                    <p className="text-sm text-surface-600">
                      {fareActCompliance.isCompliant
                        ? 'Your listing meets all NYC FARE Act requirements'
                        : 'Please resolve compliance issues before publishing'}
                    </p>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-surface-500">Property</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-semibold text-lg">{formData.title || 'Untitled'}</p>
                      <p className="text-surface-600 text-sm mt-1">
                        {formData.bedrooms === '0' ? 'Studio' : `${formData.bedrooms} BR`} • {formData.bathrooms} BA
                        {formData.squareFeet && ` • ${formData.squareFeet} sqft`}
                      </p>
                      <p className="text-surface-500 text-sm mt-2">
                        {formData.street}{formData.unit && `, ${formData.unit}`}
                        <br />
                        {formData.city}, {formData.state} {formData.zipCode}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-surface-500">Pricing</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-semibold text-2xl text-luxury-bronze">
                        {formatCurrency(parseFloat(formData.price) || 0)}<span className="text-sm font-normal text-surface-500">/month</span>
                      </p>
                      <div className="text-sm text-surface-600 mt-2 space-y-1">
                        <p>Security: {formatCurrency(parseFloat(formData.securityDeposit) || 0)}</p>
                        <p>Application Fee: {formatCurrency(parseFloat(formData.applicationFee) || 0)}</p>
                        {parseFloat(formData.brokerFee) > 0 && (
                          <p>Broker Fee: {formatCurrency(parseFloat(formData.brokerFee))} ({formData.brokerFeePaidBy.toLowerCase()} pays)</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Photos Preview */}
                {photos.length > 0 && (
                  <div>
                    <h4 className="font-medium text-surface-900 mb-3">Photos ({photos.length})</h4>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {photos.slice(0, 6).map((photo, index) => (
                        <img
                          key={photo.id}
                          src={photo.preview}
                          alt={`Preview ${index + 1}`}
                          className="h-20 w-28 object-cover rounded-lg flex-shrink-0"
                        />
                      ))}
                      {photos.length > 6 && (
                        <div className="h-20 w-28 bg-surface-100 rounded-lg flex items-center justify-center text-surface-500 flex-shrink-0">
                          +{photos.length - 6} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Amenities */}
                {formData.amenities.length > 0 && (
                  <div>
                    <h4 className="font-medium text-surface-900 mb-3">Amenities ({formData.amenities.length})</h4>
                    <div className="flex flex-wrap gap-2">
                      {formData.amenities.map((amenityId) => {
                        const amenity = Object.values(AMENITIES_CATEGORIES)
                          .flatMap((c) => c.items)
                          .find((a) => a.id === amenityId);
                        return (
                          <Badge key={amenityId} variant="default">
                            {amenity?.label || amenityId}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Delete Section */}
                <div className="border-t pt-6">
                  <h4 className="font-medium text-red-600 mb-3">Danger Zone</h4>
                  {showDeleteConfirm ? (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-red-800 mb-4">
                        Are you sure you want to delete this listing? This action cannot be undone.
                      </p>
                      <div className="flex gap-3">
                        <Button
                          variant="destructive"
                          onClick={handleDelete}
                          disabled={isDeleting}
                        >
                          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                          Confirm Delete
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowDeleteConfirm(false)}
                          disabled={isDeleting}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Listing
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="flex items-center gap-3">
            {currentStep === STEPS.length ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleSave(false)}
                  disabled={isUpdating}
                >
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Changes
                </Button>
                <Button
                  onClick={() => handleSave(true)}
                  disabled={isUpdating || !fareActCompliance.isCompliant}
                >
                  Save & View Listing
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </>
            ) : (
              <Button onClick={handleNext}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
