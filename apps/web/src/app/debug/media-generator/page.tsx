'use client';

/**
 * Media Generator Demo Page
 *
 * Demo page for testing collateral generation with compliance blocks.
 * Only available in staging/development environments.
 */

import { useState } from 'react';

// Feature flag check
const IS_STAGING = process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' ||
  process.env.NODE_ENV === 'development';

// Types for demo data
interface MockListing {
  id: string;
  title: string;
  address: {
    street: string;
    unit?: string;
    city: string;
    state: string;
    zip: string;
  };
  rent: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  marketId: string;
  amenities: string[];
}

interface MockTemplate {
  id: string;
  name: string;
  type: string;
  source: string;
  supportedFormats: string[];
  requiredComplianceBlocks: string[];
}

// Mock listings for demo
const MOCK_LISTINGS: MockListing[] = [
  {
    id: 'lst-demo-1',
    title: 'Modern Studio in Chelsea',
    address: {
      street: '123 W 23rd St',
      unit: '4A',
      city: 'New York',
      state: 'NY',
      zip: '10011',
    },
    rent: 3500,
    bedrooms: 0,
    bathrooms: 1,
    squareFeet: 450,
    marketId: 'NYC_STRICT',
    amenities: ['Gym', 'Rooftop', 'Doorman', 'Laundry'],
  },
  {
    id: 'lst-demo-2',
    title: 'Spacious 2BR in Williamsburg',
    address: {
      street: '456 Bedford Ave',
      unit: '2B',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11211',
    },
    rent: 5200,
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 950,
    marketId: 'NYC_STRICT',
    amenities: ['Dishwasher', 'In-Unit Laundry', 'Balcony'],
  },
  {
    id: 'lst-demo-3',
    title: 'Luxury 3BR in Upper East Side',
    address: {
      street: '789 Park Ave',
      unit: '12C',
      city: 'New York',
      state: 'NY',
      zip: '10065',
    },
    rent: 12000,
    bedrooms: 3,
    bathrooms: 2.5,
    squareFeet: 2100,
    marketId: 'NYC_STRICT',
    amenities: ['Doorman', 'Gym', 'Pool', 'Concierge', 'Parking'],
  },
];

// Mock templates
const MOCK_TEMPLATES: MockTemplate[] = [
  {
    id: 'tpl-system-flyer',
    name: 'Standard Property Flyer',
    type: 'flyer',
    source: 'system',
    supportedFormats: ['pdf'],
    requiredComplianceBlocks: ['nyc_fare_act_disclosure', 'nyc_fare_fee_disclosure', 'fair_housing_notice'],
  },
  {
    id: 'tpl-system-brochure',
    name: 'Full Property Brochure',
    type: 'brochure',
    source: 'system',
    supportedFormats: ['pdf', 'pptx'],
    requiredComplianceBlocks: ['nyc_fare_act_disclosure', 'nyc_fare_fee_disclosure', 'nyc_lead_paint_disclosure', 'nyc_bedbug_disclosure', 'fair_housing_notice'],
  },
  {
    id: 'tpl-system-deck',
    name: 'Listing Presentation Deck',
    type: 'listing_deck',
    source: 'system',
    supportedFormats: ['pptx'],
    requiredComplianceBlocks: ['nyc_fare_act_disclosure', 'nyc_fare_fee_disclosure', 'nyc_lead_paint_disclosure', 'fair_housing_notice'],
  },
];

// Compliance block metadata
const COMPLIANCE_BLOCKS: Record<string, { name: string; description: string; isRemovable: boolean }> = {
  'nyc_fare_act_disclosure': {
    name: 'NYC FARE Act Disclosure',
    description: 'Required notice about tenant broker fee protections under NYC Local Law 32',
    isRemovable: false,
  },
  'nyc_fare_fee_disclosure': {
    name: 'NYC Fee Transparency',
    description: 'Disclosure about who is responsible for broker fees',
    isRemovable: false,
  },
  'nyc_lead_paint_disclosure': {
    name: 'Lead Paint Disclosure',
    description: 'Required federal lead paint notice for pre-1978 buildings',
    isRemovable: false,
  },
  'nyc_bedbug_disclosure': {
    name: 'Bedbug History (NYC LL69)',
    description: 'Required disclosure of building bedbug infestation history',
    isRemovable: false,
  },
  'fair_housing_notice': {
    name: 'Fair Housing Notice',
    description: 'Federal equal housing opportunity statement',
    isRemovable: false,
  },
};

interface GenerationResult {
  id: string;
  format: string;
  checksum: string;
  fileUrl: string;
  complianceBlocksApplied: string[];
  generatedAt: string;
}

export default function MediaGeneratorDemoPage() {
  const [selectedListing, setSelectedListing] = useState<MockListing | undefined>(MOCK_LISTINGS[0]);
  const [selectedTemplate, setSelectedTemplate] = useState<MockTemplate | undefined>(MOCK_TEMPLATES[0]);
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'pptx'>('pdf');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check feature flag
  if (!IS_STAGING) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-gray-400">
            This demo is only available in staging environments.
          </p>
        </div>
      </div>
    );
  }

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      // Simulate API call with delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Mock result
      const template = selectedTemplate ?? MOCK_TEMPLATES[0];
      const mockResult: GenerationResult = {
        id: `cgen-${Date.now()}`,
        format: selectedFormat,
        checksum: Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(''),
        fileUrl: `https://storage.realriches.com/collateral/demo-${Date.now()}.${selectedFormat}`,
        complianceBlocksApplied: template?.requiredComplianceBlocks ?? [],
        generatedAt: new Date().toISOString(),
      };

      setResult(mockResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  // Use non-null assertion since we know these arrays are never empty
  const defaultListing = MOCK_LISTINGS[0]!;
  const defaultTemplate = MOCK_TEMPLATES[0]!;
  const selectedListingData = selectedListing ?? defaultListing;
  const selectedTemplateData = selectedTemplate ?? defaultTemplate;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-bold">Media Generator Demo</h1>
          <p className="text-sm text-gray-400">
            Generate PDF and PPTX collateral with compliance blocks
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Configuration */}
        <div className="space-y-6">
          {/* Listing Selection */}
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4">1. Select Listing</h2>
            <div className="space-y-2">
              {MOCK_LISTINGS.map((listing) => (
                <button
                  key={listing.id}
                  onClick={() => setSelectedListing(listing)}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    selectedListing?.id === listing.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="font-medium">{listing.title}</div>
                  <div className="text-sm text-gray-400">
                    {listing.address.street}, {listing.address.city} |
                    ${listing.rent.toLocaleString()}/mo |
                    {listing.bedrooms}BR / {listing.bathrooms}BA
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Template Selection */}
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4">2. Select Template</h2>
            <div className="space-y-2">
              {MOCK_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => {
                    setSelectedTemplate(template);
                    // Reset format if not supported
                    if (!template.supportedFormats.includes(selectedFormat)) {
                      setSelectedFormat(template.supportedFormats[0] as 'pdf' | 'pptx');
                    }
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    selectedTemplate?.id === template.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="font-medium">{template.name}</div>
                  <div className="text-sm text-gray-400">
                    Type: {template.type} |
                    Formats: {template.supportedFormats.join(', ')}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Format Selection */}
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4">3. Select Format</h2>
            <div className="flex gap-4">
              {selectedTemplateData.supportedFormats.map((format) => (
                <button
                  key={format}
                  onClick={() => setSelectedFormat(format as 'pdf' | 'pptx')}
                  className={`flex-1 p-3 rounded-lg border transition ${
                    selectedFormat === format
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="font-medium uppercase">{format}</div>
                  <div className="text-sm text-gray-400">
                    {format === 'pdf' ? 'Print-ready document' : 'Presentation slides'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={() => void handleGenerate()}
            disabled={isGenerating}
            className={`w-full py-4 rounded-lg font-semibold transition ${
              isGenerating
                ? 'bg-gray-700 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Generating...
              </span>
            ) : (
              `Generate ${selectedFormat.toUpperCase()}`
            )}
          </button>
        </div>

        {/* Right Column - Preview & Results */}
        <div className="space-y-6">
          {/* Compliance Blocks Preview */}
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4">
              Compliance Blocks (Auto-Applied)
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              These disclosures will be automatically injected and cannot be removed.
            </p>
            <div className="space-y-2">
              {selectedTemplateData.requiredComplianceBlocks.map((blockId) => {
                const block = COMPLIANCE_BLOCKS[blockId];
                return (
                  <div
                    key={blockId}
                    className="p-3 bg-gray-800 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{block?.name ?? blockId}</span>
                      <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">
                        Required
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{block?.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
              <h3 className="font-semibold text-red-400">Generation Failed</h3>
              <p className="text-sm text-gray-300 mt-1">{error}</p>
            </div>
          )}

          {/* Result Display */}
          {result && (
            <div className="bg-green-900/20 border border-green-500/50 rounded-lg p-4">
              <h3 className="font-semibold text-green-400 mb-4">
                Generation Complete
              </h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Generation ID:</span>
                  <span className="font-mono">{result.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Format:</span>
                  <span className="uppercase">{result.format}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Generated At:</span>
                  <span>{new Date(result.generatedAt).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-400">SHA-256 Checksum:</span>
                  <p className="font-mono text-xs mt-1 break-all bg-gray-800 p-2 rounded">
                    {result.checksum}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400">Compliance Blocks Applied:</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {result.complianceBlocksApplied.map((blockId) => (
                      <span
                        key={blockId}
                        className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded"
                      >
                        {COMPLIANCE_BLOCKS[blockId]?.name ?? blockId}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => window.open(result.fileUrl, '_blank')}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                >
                  Download {result.format.toUpperCase()}
                </button>
                <button
                  onClick={() => setResult(null)}
                  className="px-4 py-2 border border-gray-600 hover:bg-gray-800 rounded text-sm"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Listing Preview */}
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4">Listing Preview</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Title:</span>
                <span>{selectedListingData.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Address:</span>
                <span>
                  {selectedListingData.address.street}
                  {selectedListingData.address.unit && `, ${selectedListingData.address.unit}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">City:</span>
                <span>
                  {selectedListingData.address.city}, {selectedListingData.address.state}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Rent:</span>
                <span>${selectedListingData.rent.toLocaleString()}/mo</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Bedrooms:</span>
                <span>{selectedListingData.bedrooms}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Bathrooms:</span>
                <span>{selectedListingData.bathrooms}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Square Feet:</span>
                <span>{selectedListingData.squareFeet?.toLocaleString() ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Market:</span>
                <span className="bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded text-xs">
                  {selectedListingData.marketId}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Amenities:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedListingData.amenities.map((amenity) => (
                    <span
                      key={amenity}
                      className="bg-gray-800 px-2 py-0.5 rounded text-xs"
                    >
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
