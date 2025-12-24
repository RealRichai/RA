'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Plug,
  Search,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Key,
  Copy,
  Eye,
  EyeOff,
  Settings,
  Activity,
  Clock,
} from 'lucide-react';

type IntegrationCategory = 'email' | 'sms' | 'messaging' | 'access-control' | 'financial' | 'ai' | 'analytics';
type IntegrationStatus = 'configured' | 'partial' | 'not-configured' | 'error';

interface Integration {
  id: string;
  key: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  provider: string;
  docsUrl: string;
  status: IntegrationStatus;
  requiredEnvVars: string[];
  optionalEnvVars: string[];
  configuredEnvVars: string[];
  features: string[];
  lastCheckedAt?: string;
  lastHealthCheckStatus?: string;
  lastErrorMessage?: string;
}

const categoryLabels: Record<IntegrationCategory, string> = {
  email: 'Email',
  sms: 'SMS & Voice',
  messaging: 'Messaging',
  'access-control': 'Access Control',
  financial: 'Financial',
  ai: 'AI & ML',
  analytics: 'Analytics',
};

const statusConfig: Record<IntegrationStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType; color: string }> = {
  configured: { label: 'Configured', variant: 'default', icon: CheckCircle, color: 'text-green-500' },
  partial: { label: 'Partial', variant: 'secondary', icon: AlertTriangle, color: 'text-amber-500' },
  'not-configured': { label: 'Not Configured', variant: 'outline', icon: XCircle, color: 'text-muted-foreground' },
  error: { label: 'Error', variant: 'destructive', icon: XCircle, color: 'text-red-500' },
};

const mockIntegrations: Integration[] = [
  {
    id: 'int-1',
    key: 'sendgrid',
    name: 'SendGrid',
    description: 'Transactional and marketing email delivery',
    category: 'email',
    provider: 'Twilio',
    docsUrl: 'https://docs.sendgrid.com',
    status: 'configured',
    requiredEnvVars: ['SENDGRID_API_KEY'],
    optionalEnvVars: ['SENDGRID_FROM_EMAIL', 'SENDGRID_FROM_NAME'],
    configuredEnvVars: ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL'],
    features: ['integrations.email'],
    lastCheckedAt: '2024-12-21T10:00:00Z',
    lastHealthCheckStatus: 'healthy',
  },
  {
    id: 'int-2',
    key: 'twilio',
    name: 'Twilio SMS',
    description: 'SMS and voice communications',
    category: 'sms',
    provider: 'Twilio',
    docsUrl: 'https://www.twilio.com/docs',
    status: 'partial',
    requiredEnvVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    optionalEnvVars: [],
    configuredEnvVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    features: ['integrations.sms'],
    lastCheckedAt: '2024-12-21T10:00:00Z',
  },
  {
    id: 'int-3',
    key: 'twilio-verify',
    name: 'Twilio Verify',
    description: 'Phone number verification',
    category: 'sms',
    provider: 'Twilio',
    docsUrl: 'https://www.twilio.com/docs/verify',
    status: 'not-configured',
    requiredEnvVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SID'],
    optionalEnvVars: [],
    configuredEnvVars: [],
    features: ['integrations.phone-verify'],
  },
  {
    id: 'int-4',
    key: 'seam',
    name: 'Seam',
    description: 'Smart lock and access control',
    category: 'access-control',
    provider: 'Seam',
    docsUrl: 'https://docs.seam.co',
    status: 'not-configured',
    requiredEnvVars: ['SEAM_API_KEY'],
    optionalEnvVars: [],
    configuredEnvVars: [],
    features: ['integrations.smart-locks'],
  },
  {
    id: 'int-5',
    key: 'the-guarantors',
    name: 'TheGuarantors',
    description: 'Lease guarantee and rent protection',
    category: 'financial',
    provider: 'TheGuarantors',
    docsUrl: 'https://www.theguarantors.com',
    status: 'configured',
    requiredEnvVars: ['THE_GUARANTORS_API_KEY', 'THE_GUARANTORS_PARTNER_ID'],
    optionalEnvVars: ['THE_GUARANTORS_API_URL'],
    configuredEnvVars: ['THE_GUARANTORS_API_KEY', 'THE_GUARANTORS_PARTNER_ID'],
    features: ['integrations.guarantors'],
    lastCheckedAt: '2024-12-21T10:00:00Z',
    lastHealthCheckStatus: 'healthy',
  },
  {
    id: 'int-6',
    key: 'anthropic',
    name: 'Anthropic Claude',
    description: 'AI assistant and content generation',
    category: 'ai',
    provider: 'Anthropic',
    docsUrl: 'https://docs.anthropic.com',
    status: 'configured',
    requiredEnvVars: ['ANTHROPIC_API_KEY'],
    optionalEnvVars: [],
    configuredEnvVars: ['ANTHROPIC_API_KEY'],
    features: ['ai.listing-descriptions', 'ai.lead-followup', 'ai.chat-assistant'],
    lastCheckedAt: '2024-12-21T10:00:00Z',
    lastHealthCheckStatus: 'healthy',
  },
  {
    id: 'int-7',
    key: 'sendblue',
    name: 'Sendblue',
    description: 'iMessage business messaging',
    category: 'messaging',
    provider: 'Sendblue',
    docsUrl: 'https://sendblue.co/docs',
    status: 'not-configured',
    requiredEnvVars: ['SENDBLUE_API_KEY', 'SENDBLUE_API_SECRET'],
    optionalEnvVars: [],
    configuredEnvVars: [],
    features: ['experimental.imessage'],
  },
  {
    id: 'int-8',
    key: 'jeeva',
    name: 'Jeeva.ai',
    description: 'AI-powered lead follow-up automation',
    category: 'ai',
    provider: 'Jeeva',
    docsUrl: 'https://jeeva.ai/docs',
    status: 'not-configured',
    requiredEnvVars: ['JEEVA_API_KEY'],
    optionalEnvVars: [],
    configuredEnvVars: [],
    features: ['ai.lead-followup'],
  },
];

export default function IntegrationsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<IntegrationCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<IntegrationStatus | 'all'>('all');

  const filteredIntegrations = mockIntegrations.filter((integration) => {
    const matchesSearch =
      integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      integration.provider.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || integration.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || integration.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const stats = {
    total: mockIntegrations.length,
    configured: mockIntegrations.filter((i) => i.status === 'configured').length,
    partial: mockIntegrations.filter((i) => i.status === 'partial').length,
    notConfigured: mockIntegrations.filter((i) => i.status === 'not-configured').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Integrations</h2>
          <p className="text-sm text-muted-foreground">
            Configure third-party service connections
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh Status
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Integrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Configured
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.configured}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Partial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.partial}</div>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Not Configured
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.notConfigured}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as IntegrationCategory | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Categories</option>
            <option value="email">Email</option>
            <option value="sms">SMS & Voice</option>
            <option value="messaging">Messaging</option>
            <option value="access-control">Access Control</option>
            <option value="financial">Financial</option>
            <option value="ai">AI & ML</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as IntegrationStatus | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="configured">Configured</option>
            <option value="partial">Partial</option>
            <option value="not-configured">Not Configured</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      {/* Integrations List */}
      <div className="space-y-4">
        {filteredIntegrations.map((integration) => {
          const config = statusConfig[integration.status];
          const StatusIcon = config.icon;
          const missingVars = integration.requiredEnvVars.filter(
            (v) => !integration.configuredEnvVars.includes(v)
          );

          return (
            <Card key={integration.id}>
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{integration.name}</h3>
                          <Badge variant="outline">{categoryLabels[integration.category]}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {integration.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Provider: {integration.provider}
                        </p>
                      </div>
                      <Badge variant={config.variant}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {config.label}
                      </Badge>
                    </div>

                    {/* Environment Variables */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-1">
                        <Key className="h-4 w-4" />
                        Required Environment Variables
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {integration.requiredEnvVars.map((envVar) => {
                          const isConfigured = integration.configuredEnvVars.includes(envVar);
                          return (
                            <Badge
                              key={envVar}
                              variant={isConfigured ? 'default' : 'destructive'}
                              className="gap-1 font-mono text-xs"
                            >
                              {isConfigured ? (
                                <CheckCircle className="h-3 w-3" />
                              ) : (
                                <XCircle className="h-3 w-3" />
                              )}
                              {envVar}
                            </Badge>
                          );
                        })}
                      </div>
                      {integration.optionalEnvVars.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          <span className="text-xs text-muted-foreground">Optional:</span>
                          {integration.optionalEnvVars.map((envVar) => (
                            <Badge
                              key={envVar}
                              variant="outline"
                              className="gap-1 font-mono text-xs"
                            >
                              {envVar}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Enables:</span>
                      {integration.features.map((feature) => (
                        <Badge key={feature} variant="secondary" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                    </div>

                    {/* Health Check */}
                    {integration.lastCheckedAt && (
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Activity className="h-4 w-4" />
                          Status: {integration.lastHealthCheckStatus}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          Last checked: {new Date(integration.lastCheckedAt).toLocaleTimeString()}
                        </span>
                      </div>
                    )}

                    {/* Error Message */}
                    {integration.lastErrorMessage && (
                      <div className="p-2 bg-red-50 dark:bg-red-950 rounded-md">
                        <p className="text-sm text-red-600 dark:text-red-400">
                          Error: {integration.lastErrorMessage}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Docs
                      </a>
                    </Button>
                    <Button size="sm">
                      <Settings className="mr-2 h-4 w-4" />
                      Configure
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredIntegrations.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Plug className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No integrations found</h3>
            <p className="text-muted-foreground">Try adjusting your filters</p>
          </CardContent>
        </Card>
      )}

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration Instructions</CardTitle>
          <CardDescription>
            How to configure integrations for production deployment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">1. Add environment variables to .env</h4>
            <pre className="text-sm bg-background p-3 rounded border overflow-x-auto">
{`# Email - SendGrid
SENDGRID_API_KEY=your_api_key_here
SENDGRID_FROM_EMAIL=noreply@realriches.com

# SMS - Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# AI - Anthropic
ANTHROPIC_API_KEY=your_api_key_here`}
            </pre>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">2. Run the seed command to update status</h4>
            <pre className="text-sm bg-background p-3 rounded border">
              pnpm db:seed
            </pre>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">3. Restart the API server</h4>
            <pre className="text-sm bg-background p-3 rounded border">
              pnpm dev
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
