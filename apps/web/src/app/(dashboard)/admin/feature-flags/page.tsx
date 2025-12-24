'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Flag,
  Search,
  Plus,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle,
  Plug,
  MapPin,
  Link2,
  ToggleLeft,
  ToggleRight,
  Percent,
} from 'lucide-react';

type FeatureCategory = 'core' | 'compliance' | 'integrations' | 'ai' | 'marketing' | 'experimental';

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  category: FeatureCategory;
  enabled: boolean;
  rolloutPercentage?: number;
  requiresIntegration?: string;
  integrationConfigured?: boolean;
  dependencies?: string[];
  markets?: string[];
}

const categoryColors: Record<FeatureCategory, string> = {
  core: 'bg-blue-500',
  compliance: 'bg-red-500',
  integrations: 'bg-purple-500',
  ai: 'bg-amber-500',
  marketing: 'bg-green-500',
  experimental: 'bg-gray-500',
};

const mockFeatureFlags: FeatureFlag[] = [
  {
    id: 'ff-1',
    key: 'core.listings',
    name: 'Listings',
    description: 'Property listing management',
    category: 'core',
    enabled: true,
  },
  {
    id: 'ff-2',
    key: 'core.applications',
    name: 'Applications',
    description: 'Rental application processing',
    category: 'core',
    enabled: true,
    dependencies: ['core.listings'],
  },
  {
    id: 'ff-3',
    key: 'compliance.fare-act',
    name: 'FARE Act Compliance',
    description: 'NYC FARE Act fee disclosure and limits',
    category: 'compliance',
    enabled: true,
    markets: ['nyc-manhattan', 'nyc-brooklyn', 'nyc-queens', 'nyc-bronx', 'nyc-staten-island'],
  },
  {
    id: 'ff-4',
    key: 'compliance.fair-chance',
    name: 'Fair Chance Housing',
    description: 'NYC Fair Chance Housing Act workflow',
    category: 'compliance',
    enabled: true,
    dependencies: ['core.applications'],
    markets: ['nyc-manhattan', 'nyc-brooklyn', 'nyc-queens', 'nyc-bronx', 'nyc-staten-island'],
  },
  {
    id: 'ff-5',
    key: 'integrations.email',
    name: 'Email Notifications',
    description: 'SendGrid email integration',
    category: 'integrations',
    enabled: true,
    requiresIntegration: 'sendgrid',
    integrationConfigured: true,
  },
  {
    id: 'ff-6',
    key: 'integrations.sms',
    name: 'SMS Notifications',
    description: 'Twilio SMS integration',
    category: 'integrations',
    enabled: true,
    requiresIntegration: 'twilio',
    integrationConfigured: false,
  },
  {
    id: 'ff-7',
    key: 'integrations.smart-locks',
    name: 'Smart Lock Access',
    description: 'Seam smart lock integration for tours',
    category: 'integrations',
    enabled: false,
    requiresIntegration: 'seam',
    integrationConfigured: false,
    dependencies: ['core.leads'],
  },
  {
    id: 'ff-8',
    key: 'ai.listing-descriptions',
    name: 'AI Listing Descriptions',
    description: 'Generate listing descriptions with AI',
    category: 'ai',
    enabled: false,
    requiresIntegration: 'anthropic',
    integrationConfigured: true,
    dependencies: ['core.listings'],
  },
  {
    id: 'ff-9',
    key: 'ai.chat-assistant',
    name: 'Agent AI Assistant',
    description: 'AI chat assistant for agents',
    category: 'ai',
    enabled: false,
    requiresIntegration: 'anthropic',
    integrationConfigured: true,
    rolloutPercentage: 10,
  },
  {
    id: 'ff-10',
    key: 'marketing.3d-splats',
    name: '3D Gaussian Splats',
    description: '3D Gaussian Splatting digital twins',
    category: 'experimental',
    enabled: false,
    dependencies: ['core.listings'],
  },
  {
    id: 'ff-11',
    key: 'experimental.imessage',
    name: 'iMessage Integration',
    description: 'Sendblue iMessage for lead communication',
    category: 'experimental',
    enabled: false,
    requiresIntegration: 'sendblue',
    integrationConfigured: false,
    dependencies: ['core.leads'],
  },
];

export default function FeatureFlagsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<FeatureCategory | 'all'>('all');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  const filteredFlags = mockFeatureFlags.filter((flag) => {
    const matchesSearch =
      flag.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flag.key.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || flag.category === categoryFilter;
    const matchesEnabled =
      enabledFilter === 'all' ||
      (enabledFilter === 'enabled' && flag.enabled) ||
      (enabledFilter === 'disabled' && !flag.enabled);
    return matchesSearch && matchesCategory && matchesEnabled;
  });

  const groupedFlags = filteredFlags.reduce((acc, flag) => {
    if (!acc[flag.category]) {
      acc[flag.category] = [];
    }
    acc[flag.category].push(flag);
    return acc;
  }, {} as Record<string, FeatureFlag[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Feature Flags</h2>
          <p className="text-sm text-muted-foreground">
            Control feature availability across the platform
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Feature Flag
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockFeatureFlags.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Enabled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {mockFeatureFlags.filter((f) => f.enabled).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Disabled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">
              {mockFeatureFlags.filter((f) => !f.enabled).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search feature flags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as FeatureCategory | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Categories</option>
            <option value="core">Core</option>
            <option value="compliance">Compliance</option>
            <option value="integrations">Integrations</option>
            <option value="ai">AI</option>
            <option value="marketing">Marketing</option>
            <option value="experimental">Experimental</option>
          </select>
          <select
            value={enabledFilter}
            onChange={(e) => setEnabledFilter(e.target.value as 'all' | 'enabled' | 'disabled')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      {/* Feature Flags by Category */}
      {Object.entries(groupedFlags).map(([category, flags]) => (
        <Card key={category}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${categoryColors[category as FeatureCategory]}`} />
              <CardTitle className="capitalize">{category}</CardTitle>
              <Badge variant="secondary">{flags.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {flags.map((flag) => (
                <div
                  key={flag.id}
                  className="flex items-start justify-between p-4 rounded-lg border"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{flag.name}</h4>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{flag.key}</code>
                    </div>
                    <p className="text-sm text-muted-foreground">{flag.description}</p>

                    <div className="flex flex-wrap gap-2">
                      {flag.requiresIntegration && (
                        <Badge
                          variant={flag.integrationConfigured ? 'default' : 'destructive'}
                          className="gap-1"
                        >
                          <Plug className="h-3 w-3" />
                          {flag.requiresIntegration}
                          {!flag.integrationConfigured && ' (not configured)'}
                        </Badge>
                      )}
                      {flag.dependencies && flag.dependencies.length > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <Link2 className="h-3 w-3" />
                          Depends on: {flag.dependencies.join(', ')}
                        </Badge>
                      )}
                      {flag.markets && flag.markets.length > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <MapPin className="h-3 w-3" />
                          {flag.markets.length} markets
                        </Badge>
                      )}
                      {flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100 && (
                        <Badge variant="secondary" className="gap-1">
                          <Percent className="h-3 w-3" />
                          {flag.rolloutPercentage}% rollout
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={flag.enabled ? 'default' : 'outline'}
                      size="sm"
                      className="gap-1"
                    >
                      {flag.enabled ? (
                        <>
                          <ToggleRight className="h-4 w-4" />
                          Enabled
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="h-4 w-4" />
                          Disabled
                        </>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {filteredFlags.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Flag className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No feature flags found</h3>
            <p className="text-muted-foreground">Try adjusting your filters</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
