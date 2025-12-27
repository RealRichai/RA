'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
import { useRequireAuth, useCreateListing } from '@/hooks';
import { useAuthStore, isLandlord, isAgent } from '@/stores/auth';
import { toast } from '@/components/ui/toaster';

// =============================================================================
// CONSTANTS & TYPES
// =============================================================================

const STEPS = [
  { id: 1, title: 'Property Details', icon: Building2 },
  { id: 2, title: 'Location', icon: MapPin },
  { id: 3, title: 'Amenities', icon: Home },
  { id: 4, title: 'Photos', icon: ImageIcon },
  { id: 5, title: 'Pricing & Fees', icon: DollarSign },
  { id: 6, title: 'Review & Publish', icon: CheckCircle },
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
  // Property Details
  title: string;
  description: string;
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
  // Location
  street: string;
  unit: string;
  city: string;
  state: string;
  zipCode: string;
  borough: string;
  neighborhood: string;
  market: 'nyc' | 'long_island';
  // Amenities
  amenities: string[];
  // Pricing
  price: string;
  securityDeposit: string;
  applicationFee: string;
  brokerFee: string;
  brokerFeePaidBy: 'LANDLORD' | 'TENANT';
  // Lease Terms
  availableDate: string;
  leaseTermMonths: string;
  petsAllowed: boolean;
  petPolicy: string;
}

interface PhotoFile {
  id: string;
  file: File;
  preview: string;
  uploading: boolean;
  error?: string;
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
      // FARE Act: Application fee capped at $20
      if (applicationFee > FARE_ACT_MAX_APPLICATION_FEE) {
        violations.push({
          field: 'applicationFee',
          message: `Application fee exceeds FARE Act cap of $${FARE_ACT_MAX_APPLICATION_FEE}`,
          severity: 'error',
        });
      }

      // FARE Act: Security deposit limited to 1 month's rent
      if (securityDeposit > price) {
        violations.push({
          field: 'securityDeposit',
          message: 'Security deposit exceeds FARE Act limit of 1 month\'s rent',
          severity: 'error',
        });
      }

      // FARE Act: Broker fee defaults to landlord payment
      if (formData.brokerFeePaidBy === 'TENANT' && brokerFee > 0) {
        violations.push({
          field: 'brokerFeePaidBy',
          message: 'Under FARE Act, broker fees are paid by the party who engaged the broker (typically landlord)',
          severity: 'warning',
        });
      }
    }

    // Calculate move-in costs
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
// STEP COMPONENTS
// =============================================================================

function StepPropertyDetails({
  formData,
  updateField,
  errors,
}: {
  formData: FormState;
  updateField: (field: keyof FormState, value: any) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      <FormField label="Listing Title" error={errors.title} required>
        <Input
          placeholder="e.g., Stunning 2BR with Manhattan Skyline Views"
          value={formData.title}
          onChange={(e) => updateField('title', e.target.value)}
          error={errors.title}
        />
        <p className="text-xs text-surface-400 mt-1">
          A compelling title helps your listing stand out. Include key features.
        </p>
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
          placeholder="Describe your property's best features, layout, and what makes it special..."
          value={formData.description}
          onChange={(e) => updateField('description', e.target.value)}
        />
        <div className="flex justify-between text-xs mt-1">
          <span className="text-surface-400">Minimum 50 characters recommended</span>
          <span className={cn(
            formData.description.length < 50 ? 'text-surface-400' : 'text-emerald-600'
          )}>
            {formData.description.length} characters
          </span>
        </div>
      </FormField>

      <div className="grid grid-cols-3 gap-4">
        <FormField label="Bedrooms" error={errors.bedrooms} required>
          <Select
            value={formData.bedrooms}
            onValueChange={(v) => updateField('bedrooms', v)}
          >
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
          <Select
            value={formData.bathrooms}
            onValueChange={(v) => updateField('bathrooms', v)}
          >
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
  );
}

function StepLocation({
  formData,
  updateField,
  errors,
}: {
  formData: FormState;
  updateField: (field: keyof FormState, value: any) => void;
  errors: Record<string, string>;
}) {
  const neighborhoods = useMemo(() => {
    if (formData.market === 'long_island') return [];
    switch (formData.borough) {
      case 'manhattan': return MANHATTAN_NEIGHBORHOODS;
      case 'brooklyn': return BROOKLYN_NEIGHBORHOODS;
      case 'queens': return QUEENS_NEIGHBORHOODS;
      default: return [];
    }
  }, [formData.market, formData.borough]);

  return (
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
                if (market.value === 'nyc') {
                  updateField('state', 'NY');
                  updateField('city', 'New York');
                }
              }}
              className={cn(
                'flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left',
                formData.market === market.value
                  ? 'border-luxury-gold bg-luxury-champagne/20'
                  : 'border-surface-200 hover:border-surface-300'
              )}
            >
              <span className="font-medium text-surface-900">{market.label}</span>
              <span className="text-sm text-surface-500">{market.sublabel}</span>
            </button>
          ))}
        </div>
      </FormField>

      {formData.market === 'nyc' && (
        <FormField label="Borough" error={errors.borough} required>
          <Select
            value={formData.borough}
            onValueChange={(v) => {
              updateField('borough', v);
              updateField('neighborhood', '');
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select borough" />
            </SelectTrigger>
            <SelectContent>
              {NYC_BOROUGHS.map((b) => (
                <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      {formData.market === 'long_island' && (
        <FormField label="County" error={errors.borough} required>
          <Select
            value={formData.borough}
            onValueChange={(v) => updateField('borough', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select county" />
            </SelectTrigger>
            <SelectContent>
              {LONG_ISLAND_COUNTIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      {neighborhoods.length > 0 && (
        <FormField label="Neighborhood">
          <Select
            value={formData.neighborhood}
            onValueChange={(v) => updateField('neighborhood', v)}
          >
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

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Unit/Apt Number">
          <Input
            placeholder="4B"
            value={formData.unit}
            onChange={(e) => updateField('unit', e.target.value)}
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
        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-blue-800">NYC FARE Act Notice</p>
              <p className="text-sm text-blue-700 mt-1">
                This property is subject to NYC Local Law 18 of 2024 (FARE Act), which limits
                application fees to $20, security deposits to 1 month's rent, and requires
                broker fee transparency.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepAmenities({
  formData,
  updateField,
}: {
  formData: FormState;
  updateField: (field: keyof FormState, value: any) => void;
}) {
  const toggleAmenity = (id: string) => {
    const current = formData.amenities;
    const updated = current.includes(id)
      ? current.filter((a) => a !== id)
      : [...current, id];
    updateField('amenities', updated);
  };

  return (
    <div className="space-y-8">
      <div className="text-center mb-6">
        <p className="text-surface-600">
          Select all amenities that apply to make your listing more discoverable.
        </p>
        <p className="text-sm text-surface-400 mt-1">
          Premium amenities are marked with <Sparkles className="inline h-3 w-3 text-luxury-gold" />
        </p>
      </div>

      {Object.entries(AMENITIES_CATEGORIES).map(([key, category]) => (
        <div key={key}>
          <h3 className="font-medium text-surface-900 mb-3">{category.label}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {category.items.map((item) => {
              const selected = formData.amenities.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleAmenity(item.id)}
                  className={cn(
                    'flex items-center justify-between gap-2 p-3 rounded-xl border transition-all text-left text-sm',
                    selected
                      ? 'border-luxury-gold bg-luxury-champagne/20 text-luxury-bronze'
                      : 'border-surface-200 hover:border-surface-300 text-surface-700'
                  )}
                >
                  <span>{item.label}</span>
                  <div className="flex items-center gap-1">
                    {item.premium && <Sparkles className="h-3 w-3 text-luxury-gold" />}
                    {selected && <CheckCircle className="h-4 w-4 text-luxury-gold" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="pt-4 border-t border-surface-100">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.petsAllowed}
              onChange={(e) => updateField('petsAllowed', e.target.checked)}
              className="h-5 w-5 rounded border-surface-300 text-luxury-gold focus:ring-luxury-gold"
            />
            <PawPrint className="h-5 w-5 text-surface-500" />
            <span className="font-medium">Pets Allowed</span>
          </label>
        </div>

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

      <div className="p-4 bg-surface-50 rounded-xl">
        <p className="text-sm text-surface-600">
          <strong>{formData.amenities.length}</strong> amenities selected
          {formData.amenities.filter(a => 
            Object.values(AMENITIES_CATEGORIES).flatMap(c => c.items).find(i => i.id === a && i.premium)
          ).length > 0 && (
            <span className="ml-2 text-luxury-bronze">
              including {formData.amenities.filter(a => 
                Object.values(AMENITIES_CATEGORIES).flatMap(c => c.items).find(i => i.id === a && i.premium)
              ).length} premium features
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function StepPhotos({
  photos,
  setPhotos,
  errors,
}: {
  photos: PhotoFile[];
  setPhotos: React.Dispatch<React.SetStateAction<PhotoFile[]>>;
  errors: Record<string, string>;
}) {
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
        id: `${Date.now()}-${i}`,
        file,
        preview: URL.createObjectURL(file),
        uploading: false,
      });
    }

    setPhotos((prev) => [...prev, ...newPhotos]);
  }, [setPhotos]);

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.preview);
      return prev.filter((p) => p.id !== id);
    });
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
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <p className="text-surface-600">
          High-quality photos significantly increase interest. Upload at least 5 photos.
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
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {index > 0 && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => movePhoto(photo.id, 'up')}
                  >
                    ←
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => removePhoto(photo.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
                {index < photos.length - 1 && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => movePhoto(photo.id, 'down')}
                  >
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
          <strong>{photos.length}</strong> photo{photos.length !== 1 ? 's' : ''} selected
          {photos.length < 5 && (
            <span className="text-amber-600 ml-2">
              (add {5 - photos.length} more for best results)
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function StepPricing({
  formData,
  updateField,
  errors,
  compliance,
}: {
  formData: FormState;
  updateField: (field: keyof FormState, value: any) => void;
  errors: Record<string, string>;
  compliance: ReturnType<typeof useFareActCompliance>;
}) {
  const price = parseFloat(formData.price) || 0;

  return (
    <div className="space-y-6">
      {compliance.isNYC && (
        <div className="p-4 bg-luxury-champagne/30 rounded-xl border border-luxury-gold/30">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-luxury-bronze mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-luxury-bronze">FARE Act Compliance Mode</p>
              <p className="text-sm text-surface-700 mt-1">
                NYC listings are automatically validated for FARE Act compliance.
                Application fees are capped at $20 and security deposits at 1 month's rent.
              </p>
            </div>
          </div>
        </div>
      )}

      <FormField label="Monthly Rent" error={errors.price} required>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400">$</span>
          <Input
            type="number"
            placeholder="3,500"
            value={formData.price}
            onChange={(e) => updateField('price', e.target.value)}
            error={errors.price}
            className="pl-8"
          />
        </div>
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField 
          label="Security Deposit" 
          error={errors.securityDeposit || compliance.violations.find(v => v.field === 'securityDeposit')?.message}
          hint={compliance.isNYC ? `Max: ${formatCurrency(price)} (1 month)` : undefined}
          required
        >
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400">$</span>
            <Input
              type="number"
              placeholder={compliance.isNYC && price > 0 ? String(price) : '3,500'}
              value={formData.securityDeposit}
              onChange={(e) => updateField('securityDeposit', e.target.value)}
              error={errors.securityDeposit || compliance.violations.find(v => v.field === 'securityDeposit')?.message}
              className="pl-8"
            />
          </div>
        </FormField>

        <FormField 
          label="Application Fee" 
          error={errors.applicationFee || compliance.violations.find(v => v.field === 'applicationFee')?.message}
          hint={compliance.isNYC ? `Max: $${FARE_ACT_MAX_APPLICATION_FEE} (FARE Act)` : undefined}
          required
        >
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400">$</span>
            <Input
              type="number"
              placeholder={compliance.isNYC ? '20' : '50'}
              value={formData.applicationFee}
              onChange={(e) => updateField('applicationFee', e.target.value)}
              error={errors.applicationFee || compliance.violations.find(v => v.field === 'applicationFee')?.message}
              className="pl-8"
            />
          </div>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Broker Fee">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400">$</span>
            <Input
              type="number"
              placeholder="0"
              value={formData.brokerFee}
              onChange={(e) => updateField('brokerFee', e.target.value)}
              className="pl-8"
            />
          </div>
        </FormField>

        <FormField 
          label="Broker Fee Paid By"
          error={compliance.violations.find(v => v.field === 'brokerFeePaidBy')?.message}
        >
          <Select
            value={formData.brokerFeePaidBy}
            onValueChange={(v) => updateField('brokerFeePaidBy', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LANDLORD">Landlord {compliance.isNYC && '(FARE Act default)'}</SelectItem>
              <SelectItem value="TENANT">Tenant</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Available Date" error={errors.availableDate} required>
          <Input
            type="date"
            value={formData.availableDate}
            onChange={(e) => updateField('availableDate', e.target.value)}
            error={errors.availableDate}
            min={new Date().toISOString().split('T')[0]}
          />
        </FormField>

        <FormField label="Lease Term" error={errors.leaseTermMonths} required>
          <Select
            value={formData.leaseTermMonths}
            onValueChange={(v) => updateField('leaseTermMonths', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6 months</SelectItem>
              <SelectItem value="12">12 months</SelectItem>
              <SelectItem value="18">18 months</SelectItem>
              <SelectItem value="24">24 months</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>

      {compliance.violations.length > 0 && (
        <div className="space-y-2">
          {compliance.violations.map((v, i) => (
            <div
              key={i}
              className={cn(
                'p-3 rounded-xl flex items-start gap-3',
                v.severity === 'error' ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'
              )}
            >
              <AlertCircle className={cn(
                'h-5 w-5 mt-0.5 flex-shrink-0',
                v.severity === 'error' ? 'text-red-600' : 'text-amber-600'
              )} />
              <span className={cn(
                'text-sm',
                v.severity === 'error' ? 'text-red-700' : 'text-amber-700'
              )}>
                {v.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Move-in Cost Preview */}
      <div className="p-6 bg-surface-50 rounded-2xl">
        <h3 className="font-medium text-surface-900 mb-4">Tenant Move-in Costs Preview</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-surface-500">First Month's Rent</span>
            <span className="font-medium">{formatCurrency(compliance.moveInCosts.firstMonth)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-surface-500">Security Deposit</span>
            <span className="font-medium">{formatCurrency(compliance.moveInCosts.securityDeposit)}</span>
          </div>
          {compliance.moveInCosts.brokerFee > 0 && (
            <div className="flex justify-between">
              <span className="text-surface-500">Broker Fee (Tenant)</span>
              <span className="font-medium">{formatCurrency(compliance.moveInCosts.brokerFee)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-surface-500">Application Fee</span>
            <span className="font-medium">{formatCurrency(compliance.moveInCosts.applicationFee)}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-surface-200">
            <span className="font-semibold text-surface-900">Total Move-in Cost</span>
            <span className="font-bold text-lg text-luxury-bronze">
              {formatCurrency(compliance.moveInCosts.total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepReview({
  formData,
  photos,
  compliance,
}: {
  formData: FormState;
  photos: PhotoFile[];
  compliance: ReturnType<typeof useFareActCompliance>;
}) {
  return (
    <div className="space-y-6">
      {/* Compliance Status */}
      <div className={cn(
        'p-4 rounded-xl flex items-center gap-3',
        compliance.isCompliant
          ? 'bg-emerald-50 border border-emerald-200'
          : 'bg-red-50 border border-red-200'
      )}>
        {compliance.isCompliant ? (
          <>
            <CheckCircle className="h-6 w-6 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-800">
                {compliance.isNYC ? 'FARE Act Compliant' : 'Ready to Publish'}
              </p>
              <p className="text-sm text-emerald-700">
                Your listing meets all requirements.
              </p>
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="h-6 w-6 text-red-600" />
            <div>
              <p className="font-medium text-red-800">Compliance Issues Found</p>
              <p className="text-sm text-red-700">
                Please fix the issues on the Pricing tab before publishing.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Property Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Property Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xl font-display font-semibold text-surface-900">
              {formData.title || 'Untitled Listing'}
            </p>
            <p className="text-surface-500 mt-1">
              {formData.description?.slice(0, 150)}
              {(formData.description?.length || 0) > 150 ? '...' : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <Bed className="h-4 w-4 text-surface-400" />
              {formData.bedrooms === '0' ? 'Studio' : `${formData.bedrooms} Bed`}
            </span>
            <span className="flex items-center gap-1.5">
              <Bath className="h-4 w-4 text-surface-400" />
              {formData.bathrooms} Bath
            </span>
            {formData.squareFeet && (
              <span className="flex items-center gap-1.5">
                <Square className="h-4 w-4 text-surface-400" />
                {formData.squareFeet} sq ft
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-surface-600">
            <MapPin className="h-4 w-4" />
            {[formData.street, formData.unit && `#${formData.unit}`, formData.neighborhood, formData.city]
              .filter(Boolean)
              .join(', ')}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge>{PROPERTY_TYPES.find(t => t.value === formData.propertyType)?.label || formData.propertyType}</Badge>
            {formData.market === 'nyc' && <Badge variant="gold">NYC FARE Act</Badge>}
            {formData.petsAllowed && <Badge variant="success">Pets OK</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Amenities Summary */}
      {formData.amenities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Amenities ({formData.amenities.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {formData.amenities.map((id) => {
                const item = Object.values(AMENITIES_CATEGORIES)
                  .flatMap((c) => c.items)
                  .find((i) => i.id === id);
                return item ? (
                  <Badge key={id} variant={item.premium ? 'gold' : 'default'}>
                    {item.label}
                  </Badge>
                ) : null;
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photos Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Photos ({photos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {photos.slice(0, 4).map((photo, i) => (
                <div key={photo.id} className="aspect-[4/3] rounded-lg overflow-hidden">
                  <img src={photo.preview} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
              {photos.length > 4 && (
                <div className="aspect-[4/3] rounded-lg bg-surface-100 flex items-center justify-center">
                  <span className="text-surface-500 font-medium">+{photos.length - 4} more</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-surface-500 text-sm">No photos uploaded</p>
          )}
        </CardContent>
      </Card>

      {/* Pricing Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Pricing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-display font-bold text-surface-900">
                {formatCurrency(parseFloat(formData.price) || 0)}
              </p>
              <p className="text-sm text-surface-500">per month</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-surface-500 mb-1">Move-in Total</p>
              <p className="text-xl font-bold text-luxury-bronze">
                {formatCurrency(compliance.moveInCosts.total)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-surface-100 text-sm">
            <div className="flex justify-between">
              <span className="text-surface-500">Security Deposit</span>
              <span>{formatCurrency(parseFloat(formData.securityDeposit) || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-500">Application Fee</span>
              <span>{formatCurrency(parseFloat(formData.applicationFee) || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-500">Lease Term</span>
              <span>{formData.leaseTermMonths} months</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-500">Available</span>
              <span>{formData.availableDate || 'Not set'}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function NewListingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth('/dashboard/listings/new');
  const { user } = useAuthStore();
  const createListing = useCreateListing();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<FormState>({
    title: '',
    description: '',
    propertyType: '',
    bedrooms: '',
    bathrooms: '',
    squareFeet: '',
    street: '',
    unit: '',
    city: 'New York',
    state: 'NY',
    zipCode: '',
    borough: '',
    neighborhood: '',
    market: 'nyc',
    amenities: [],
    price: '',
    securityDeposit: '',
    applicationFee: '20',
    brokerFee: '0',
    brokerFeePaidBy: 'LANDLORD',
    availableDate: '',
    leaseTermMonths: '12',
    petsAllowed: false,
    petPolicy: '',
  });

  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const compliance = useFareActCompliance(formData);

  const updateField = useCallback((field: keyof FormState, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  const validateStep = useCallback((step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (!formData.title.trim()) newErrors.title = 'Title is required';
      if (formData.title.length < 10) newErrors.title = 'Title must be at least 10 characters';
      if (!formData.propertyType) newErrors.propertyType = 'Property type is required';
      if (!formData.description.trim()) newErrors.description = 'Description is required';
      if (!formData.bedrooms) newErrors.bedrooms = 'Bedrooms is required';
      if (!formData.bathrooms) newErrors.bathrooms = 'Bathrooms is required';
    }

    if (step === 2) {
      if (!formData.street.trim()) newErrors.street = 'Street address is required';
      if (!formData.zipCode.trim()) newErrors.zipCode = 'ZIP code is required';
      if (!formData.borough) newErrors.borough = formData.market === 'nyc' ? 'Borough is required' : 'County is required';
    }

    if (step === 4) {
      if (photos.length < 1) newErrors.photos = 'At least 1 photo is required';
    }

    if (step === 5) {
      if (!formData.price || parseFloat(formData.price) <= 0) newErrors.price = 'Valid monthly rent is required';
      if (!formData.securityDeposit) newErrors.securityDeposit = 'Security deposit is required';
      if (!formData.applicationFee) newErrors.applicationFee = 'Application fee is required';
      if (!formData.availableDate) newErrors.availableDate = 'Available date is required';
      if (!formData.leaseTermMonths) newErrors.leaseTermMonths = 'Lease term is required';

      // FARE Act validation
      if (!compliance.isCompliant) {
        compliance.violations
          .filter((v) => v.severity === 'error')
          .forEach((v) => {
            newErrors[v.field] = v.message;
          });
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, photos, compliance]);

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (asDraft = false) => {
    if (!asDraft && !validateStep(currentStep)) return;
    if (!asDraft && !compliance.isCompliant) {
      toast({
        title: 'Compliance Issues',
        description: 'Please fix FARE Act compliance issues before publishing.',
        variant: 'error',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // In production, this would upload photos first, then create listing
      // For now, simulate the API call
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const listingData = {
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
        leaseTermMonths: parseInt(formData.leaseTermMonths),
        petsAllowed: formData.petsAllowed,
        petPolicy: formData.petPolicy || undefined,
      };

      toast({
        title: asDraft ? 'Draft saved!' : 'Listing published!',
        description: asDraft
          ? 'You can continue editing anytime.'
          : 'Your listing is now live and visible to tenants.',
        variant: 'success',
      });

      router.push('/dashboard');
    } catch (error) {
      toast({
        title: 'Failed to save listing',
        description: 'Please try again.',
        variant: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Authorization check
  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="container-wide py-8">
          <div className="max-w-3xl mx-auto animate-pulse space-y-6">
            <div className="h-8 w-48 bg-surface-200 rounded" />
            <div className="h-64 bg-surface-200 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  // Only landlords and agents can create listings
  if (!isLandlord(user) && !isAgent(user)) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="container-wide py-8">
          <Card className="max-w-lg mx-auto">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-display font-semibold mb-2">Access Restricted</h2>
              <p className="text-surface-500 mb-4">
                Only landlords and agents can create property listings.
              </p>
              <Button asChild>
                <Link href="/dashboard">Return to Dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="container-wide py-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center text-sm text-surface-500 hover:text-surface-700 mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-display font-bold text-surface-900">
              Create New Listing
            </h1>
            <p className="text-surface-500 mt-1">
              Fill in the details to list your property on RealRiches.
            </p>
          </div>

          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between relative">
              {/* Progress Line */}
              <div className="absolute top-5 left-0 right-0 h-0.5 bg-surface-200" />
              <div
                className="absolute top-5 left-0 h-0.5 bg-luxury-gold transition-all duration-300"
                style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
              />

              {STEPS.map((step) => {
                const Icon = step.icon;
                const isComplete = currentStep > step.id;
                const isCurrent = currentStep === step.id;

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      if (step.id < currentStep) setCurrentStep(step.id);
                    }}
                    disabled={step.id > currentStep}
                    className={cn(
                      'relative z-10 flex flex-col items-center gap-2 transition-all',
                      step.id <= currentStep ? 'cursor-pointer' : 'cursor-not-allowed'
                    )}
                  >
                    <div
                      className={cn(
                        'h-10 w-10 rounded-full flex items-center justify-center transition-all',
                        isComplete && 'bg-luxury-gold text-white',
                        isCurrent && 'bg-luxury-bronze text-white ring-4 ring-luxury-champagne',
                        !isComplete && !isCurrent && 'bg-white border-2 border-surface-200 text-surface-400'
                      )}
                    >
                      {isComplete ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-xs font-medium whitespace-nowrap',
                        isCurrent ? 'text-luxury-bronze' : 'text-surface-400'
                      )}
                    >
                      {step.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form Card */}
          <Card>
            <CardHeader>
              <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
              <CardDescription>
                Step {currentStep} of {STEPS.length}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step Content */}
              {currentStep === 1 && (
                <StepPropertyDetails
                  formData={formData}
                  updateField={updateField}
                  errors={errors}
                />
              )}
              {currentStep === 2 && (
                <StepLocation
                  formData={formData}
                  updateField={updateField}
                  errors={errors}
                />
              )}
              {currentStep === 3 && (
                <StepAmenities
                  formData={formData}
                  updateField={updateField}
                />
              )}
              {currentStep === 4 && (
                <StepPhotos
                  photos={photos}
                  setPhotos={setPhotos}
                  errors={errors}
                />
              )}
              {currentStep === 5 && (
                <StepPricing
                  formData={formData}
                  updateField={updateField}
                  errors={errors}
                  compliance={compliance}
                />
              )}
              {currentStep === 6 && (
                <StepReview
                  formData={formData}
                  photos={photos}
                  compliance={compliance}
                />
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-6 border-t border-surface-100">
                {currentStep > 1 ? (
                  <Button variant="outline" onClick={prevStep}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => handleSubmit(true)} disabled={isSubmitting}>
                    Save as Draft
                  </Button>
                )}

                {currentStep < STEPS.length ? (
                  <Button onClick={nextStep}>
                    Continue
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => handleSubmit(true)}
                      disabled={isSubmitting}
                    >
                      Save as Draft
                    </Button>
                    <Button
                      onClick={() => handleSubmit(false)}
                      loading={isSubmitting}
                      disabled={!compliance.isCompliant}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Publish Listing
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
