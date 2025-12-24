'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Search,
  Plus,
  Edit,
  CheckCircle,
  XCircle,
  AlertTriangle,
  DollarSign,
  Shield,
  Building2,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

type Region = 'nyc' | 'long-island' | 'westchester' | 'hudson-valley';

interface Market {
  id: string;
  key: string;
  name: string;
  state: string;
  region: Region;
  enabled: boolean;
  zipCodePrefixes: string[];
  compliance: {
    fareActRequired: boolean;
    fairChanceRequired: boolean;
    sourceOfIncomeProtection: boolean;
    securityDepositLimit: number;
    applicationFeeCap: number;
    brokerFeeRules: string;
    rentStabilization: boolean;
  };
  fees: {
    defaultApplicationFee: number;
    defaultSecurityDeposit: number;
    typicalBrokerFeePercent: number;
  };
  stats?: {
    listings: number;
    activeLeases: number;
  };
}

const regionLabels: Record<Region, string> = {
  nyc: 'New York City',
  'long-island': 'Long Island',
  westchester: 'Westchester',
  'hudson-valley': 'Hudson Valley',
};

const mockMarkets: Market[] = [
  {
    id: 'mkt-1',
    key: 'nyc-manhattan',
    name: 'Manhattan',
    state: 'NY',
    region: 'nyc',
    enabled: true,
    zipCodePrefixes: ['100', '101', '102'],
    compliance: {
      fareActRequired: true,
      fairChanceRequired: true,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1,
      applicationFeeCap: 20,
      brokerFeeRules: 'tenant-optional',
      rentStabilization: true,
    },
    fees: {
      defaultApplicationFee: 20,
      defaultSecurityDeposit: 1,
      typicalBrokerFeePercent: 15,
    },
    stats: { listings: 245, activeLeases: 189 },
  },
  {
    id: 'mkt-2',
    key: 'nyc-brooklyn',
    name: 'Brooklyn',
    state: 'NY',
    region: 'nyc',
    enabled: true,
    zipCodePrefixes: ['112'],
    compliance: {
      fareActRequired: true,
      fairChanceRequired: true,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1,
      applicationFeeCap: 20,
      brokerFeeRules: 'tenant-optional',
      rentStabilization: true,
    },
    fees: {
      defaultApplicationFee: 20,
      defaultSecurityDeposit: 1,
      typicalBrokerFeePercent: 15,
    },
    stats: { listings: 312, activeLeases: 276 },
  },
  {
    id: 'mkt-3',
    key: 'nyc-queens',
    name: 'Queens',
    state: 'NY',
    region: 'nyc',
    enabled: true,
    zipCodePrefixes: ['110', '111', '113', '114', '116'],
    compliance: {
      fareActRequired: true,
      fairChanceRequired: true,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1,
      applicationFeeCap: 20,
      brokerFeeRules: 'tenant-optional',
      rentStabilization: true,
    },
    fees: {
      defaultApplicationFee: 20,
      defaultSecurityDeposit: 1,
      typicalBrokerFeePercent: 15,
    },
    stats: { listings: 198, activeLeases: 154 },
  },
  {
    id: 'mkt-4',
    key: 'li-nassau',
    name: 'Nassau County',
    state: 'NY',
    region: 'long-island',
    enabled: true,
    zipCodePrefixes: ['110', '115', '116'],
    compliance: {
      fareActRequired: false,
      fairChanceRequired: false,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1,
      applicationFeeCap: 50,
      brokerFeeRules: 'negotiable',
      rentStabilization: false,
    },
    fees: {
      defaultApplicationFee: 50,
      defaultSecurityDeposit: 1,
      typicalBrokerFeePercent: 15,
    },
    stats: { listings: 87, activeLeases: 72 },
  },
  {
    id: 'mkt-5',
    key: 'westchester',
    name: 'Westchester County',
    state: 'NY',
    region: 'westchester',
    enabled: true,
    zipCodePrefixes: ['105', '106', '107', '108', '109'],
    compliance: {
      fareActRequired: false,
      fairChanceRequired: false,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1,
      applicationFeeCap: 50,
      brokerFeeRules: 'negotiable',
      rentStabilization: false,
    },
    fees: {
      defaultApplicationFee: 50,
      defaultSecurityDeposit: 1,
      typicalBrokerFeePercent: 15,
    },
    stats: { listings: 65, activeLeases: 48 },
  },
  {
    id: 'mkt-6',
    key: 'jersey-city',
    name: 'Jersey City',
    state: 'NJ',
    region: 'hudson-valley',
    enabled: false,
    zipCodePrefixes: ['073'],
    compliance: {
      fareActRequired: false,
      fairChanceRequired: false,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1.5,
      applicationFeeCap: 50,
      brokerFeeRules: 'negotiable',
      rentStabilization: false,
    },
    fees: {
      defaultApplicationFee: 50,
      defaultSecurityDeposit: 1.5,
      typicalBrokerFeePercent: 15,
    },
  },
  {
    id: 'mkt-7',
    key: 'hoboken',
    name: 'Hoboken',
    state: 'NJ',
    region: 'hudson-valley',
    enabled: false,
    zipCodePrefixes: ['070'],
    compliance: {
      fareActRequired: false,
      fairChanceRequired: false,
      sourceOfIncomeProtection: true,
      securityDepositLimit: 1.5,
      applicationFeeCap: 50,
      brokerFeeRules: 'negotiable',
      rentStabilization: false,
    },
    fees: {
      defaultApplicationFee: 50,
      defaultSecurityDeposit: 1.5,
      typicalBrokerFeePercent: 15,
    },
  },
];

export default function MarketsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<Region | 'all'>('all');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  const filteredMarkets = mockMarkets.filter((market) => {
    const matchesSearch =
      market.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      market.key.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRegion = regionFilter === 'all' || market.region === regionFilter;
    const matchesEnabled =
      enabledFilter === 'all' ||
      (enabledFilter === 'enabled' && market.enabled) ||
      (enabledFilter === 'disabled' && !market.enabled);
    return matchesSearch && matchesRegion && matchesEnabled;
  });

  const groupedMarkets = filteredMarkets.reduce((acc, market) => {
    if (!acc[market.region]) {
      acc[market.region] = [];
    }
    acc[market.region].push(market);
    return acc;
  }, {} as Record<string, Market[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Markets</h2>
          <p className="text-sm text-muted-foreground">
            Configure market-specific compliance and fee settings
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Market
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Markets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockMarkets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {mockMarkets.filter((m) => m.enabled).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">FARE Act Markets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {mockMarkets.filter((m) => m.compliance.fareActRequired).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Listings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockMarkets.reduce((sum, m) => sum + (m.stats?.listings || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search markets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value as Region | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Regions</option>
            <option value="nyc">New York City</option>
            <option value="long-island">Long Island</option>
            <option value="westchester">Westchester</option>
            <option value="hudson-valley">Hudson Valley</option>
          </select>
          <select
            value={enabledFilter}
            onChange={(e) => setEnabledFilter(e.target.value as 'all' | 'enabled' | 'disabled')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="enabled">Active</option>
            <option value="disabled">Inactive</option>
          </select>
        </div>
      </div>

      {/* Markets by Region */}
      {Object.entries(groupedMarkets).map(([region, markets]) => (
        <Card key={region}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <CardTitle>{regionLabels[region as Region]}</CardTitle>
              <Badge variant="secondary">{markets.length} markets</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {markets.map((market) => (
                <div
                  key={market.id}
                  className={`p-4 rounded-lg border ${!market.enabled ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{market.name}</h4>
                        <Badge variant="outline">{market.state}</Badge>
                        {!market.enabled && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                      <code className="text-xs text-muted-foreground">{market.key}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={market.enabled ? 'default' : 'outline'}
                        size="sm"
                        className="gap-1"
                      >
                        {market.enabled ? (
                          <>
                            <ToggleRight className="h-4 w-4" />
                            Active
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-4 w-4" />
                            Inactive
                          </>
                        )}
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Compliance Requirements */}
                  <div className="grid gap-4 sm:grid-cols-2 mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        Compliance Requirements
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {market.compliance.fareActRequired && (
                          <Badge variant="default" className="text-xs">FARE Act</Badge>
                        )}
                        {market.compliance.fairChanceRequired && (
                          <Badge variant="default" className="text-xs">Fair Chance</Badge>
                        )}
                        {market.compliance.sourceOfIncomeProtection && (
                          <Badge variant="secondary" className="text-xs">SOI Protection</Badge>
                        )}
                        {market.compliance.rentStabilization && (
                          <Badge variant="secondary" className="text-xs">Rent Stabilized</Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Fee Limits
                      </p>
                      <div className="flex flex-wrap gap-2 text-sm">
                        <span>App Fee: ${market.compliance.applicationFeeCap}</span>
                        <span>•</span>
                        <span>Security: {market.compliance.securityDepositLimit}mo</span>
                        <span>•</span>
                        <span className="capitalize">{market.compliance.brokerFeeRules.replace('-', ' ')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  {market.stats && (
                    <div className="flex gap-4 text-sm text-muted-foreground pt-2 border-t">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" />
                        {market.stats.listings} listings
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" />
                        {market.stats.activeLeases} active leases
                      </span>
                      <span>ZIP Prefixes: {market.zipCodePrefixes.join(', ')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {filteredMarkets.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No markets found</h3>
            <p className="text-muted-foreground">Try adjusting your filters</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
