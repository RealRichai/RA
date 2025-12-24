'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Users,
  Search,
  Filter,
  Download,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  Eye,
  Edit,
  Send,
  UserPlus,
  TrendingUp,
  Star,
  Sparkles,
} from 'lucide-react';

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'showing_scheduled' | 'application_started' | 'converted' | 'lost';
type ContactMethod = 'email' | 'phone' | 'sms' | 'imessage' | 'whatsapp';

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  status: LeadStatus;
  source: string;
  preferredContact: ContactMethod;
  budget?: number;
  moveInTimeline?: string;
  propertyPreferences?: {
    neighborhoods?: string[];
    bedrooms?: number;
    amenities?: string[];
  };
  listingId?: string;
  listingAddress?: string;
  notes?: string;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  jeevaEnabled?: boolean;
  createdAt: string;
}

const statusConfig: Record<LeadStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; color: string }> = {
  new: { label: 'New', variant: 'default', color: 'bg-blue-500' },
  contacted: { label: 'Contacted', variant: 'secondary', color: 'bg-yellow-500' },
  qualified: { label: 'Qualified', variant: 'outline', color: 'bg-purple-500' },
  showing_scheduled: { label: 'Showing Scheduled', variant: 'outline', color: 'bg-indigo-500' },
  application_started: { label: 'Application Started', variant: 'default', color: 'bg-green-500' },
  converted: { label: 'Converted', variant: 'default', color: 'bg-emerald-500' },
  lost: { label: 'Lost', variant: 'destructive', color: 'bg-red-500' },
};

const mockLeads: Lead[] = [
  {
    id: 'lead-1',
    firstName: 'Jennifer',
    lastName: 'Martinez',
    email: 'jennifer.martinez@email.com',
    phone: '+1 (212) 555-0123',
    status: 'new',
    source: 'StreetEasy',
    preferredContact: 'email',
    budget: 4000,
    moveInTimeline: 'Within 1 month',
    propertyPreferences: {
      neighborhoods: ['Upper East Side', 'Midtown'],
      bedrooms: 2,
      amenities: ['doorman', 'gym', 'laundry'],
    },
    listingId: 'listing-1',
    listingAddress: '245 E 24th St, Unit 4B',
    createdAt: '2024-12-20T10:30:00Z',
  },
  {
    id: 'lead-2',
    firstName: 'David',
    lastName: 'Kim',
    email: 'david.kim@email.com',
    phone: '+1 (718) 555-0456',
    status: 'contacted',
    source: 'Zillow',
    preferredContact: 'phone',
    budget: 3200,
    moveInTimeline: 'Flexible',
    propertyPreferences: {
      neighborhoods: ['Brooklyn Heights', 'DUMBO'],
      bedrooms: 1,
    },
    lastContactedAt: '2024-12-19T14:00:00Z',
    nextFollowUpAt: '2024-12-22T10:00:00Z',
    jeevaEnabled: true,
    createdAt: '2024-12-18T09:15:00Z',
  },
  {
    id: 'lead-3',
    firstName: 'Amanda',
    lastName: 'Thompson',
    email: 'amanda.t@email.com',
    phone: '+1 (917) 555-0789',
    status: 'qualified',
    source: 'Referral',
    preferredContact: 'sms',
    budget: 5500,
    moveInTimeline: 'Feb 1, 2025',
    propertyPreferences: {
      neighborhoods: ['SoHo', 'West Village', 'Chelsea'],
      bedrooms: 2,
      amenities: ['outdoor space', 'pet-friendly'],
    },
    notes: 'Relocating from Boston, works in finance',
    lastContactedAt: '2024-12-20T11:30:00Z',
    createdAt: '2024-12-15T16:45:00Z',
  },
  {
    id: 'lead-4',
    firstName: 'Robert',
    lastName: 'Garcia',
    email: 'r.garcia@email.com',
    status: 'showing_scheduled',
    source: 'Website',
    preferredContact: 'email',
    budget: 2800,
    moveInTimeline: 'ASAP',
    propertyPreferences: {
      neighborhoods: ['Astoria', 'Long Island City'],
      bedrooms: 1,
    },
    listingId: 'listing-5',
    listingAddress: '55-10 Queens Blvd, Unit 8C',
    nextFollowUpAt: '2024-12-21T15:00:00Z',
    createdAt: '2024-12-17T08:00:00Z',
  },
  {
    id: 'lead-5',
    firstName: 'Michelle',
    lastName: 'Lee',
    email: 'michelle.lee@email.com',
    phone: '+1 (646) 555-0321',
    status: 'application_started',
    source: 'Instagram Ad',
    preferredContact: 'imessage',
    budget: 4500,
    moveInTimeline: 'Jan 15, 2025',
    propertyPreferences: {
      neighborhoods: ['Williamsburg'],
      bedrooms: 2,
      amenities: ['roof deck', 'washer/dryer'],
    },
    listingId: 'listing-3',
    listingAddress: '180 Bedford Ave, Unit 5A',
    jeevaEnabled: true,
    createdAt: '2024-12-10T12:00:00Z',
  },
  {
    id: 'lead-6',
    firstName: 'Thomas',
    lastName: 'Brown',
    email: 'thomas.b@email.com',
    status: 'lost',
    source: 'Apartments.com',
    preferredContact: 'email',
    budget: 3000,
    notes: 'Found apartment through another broker',
    createdAt: '2024-12-05T09:30:00Z',
  },
];

export default function LeadsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');

  const filteredLeads = mockLeads.filter((lead) => {
    const matchesSearch =
      `${lead.firstName} ${lead.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone?.includes(searchQuery);
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    newLeads: mockLeads.filter((l) => l.status === 'new').length,
    inProgress: mockLeads.filter((l) => ['contacted', 'qualified', 'showing_scheduled', 'application_started'].includes(l.status)).length,
    converted: mockLeads.filter((l) => l.status === 'converted').length,
    conversionRate: Math.round(
      (mockLeads.filter((l) => l.status === 'converted').length /
        mockLeads.filter((l) => l.status !== 'new').length) * 100
    ) || 0,
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">
            Manage and nurture your rental leads
          </p>
        </div>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Lead
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">New Leads</CardTitle>
            <Star className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.newLeads}</div>
            <p className="text-xs text-muted-foreground">Awaiting contact</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inProgress}</div>
            <p className="text-xs text-muted-foreground">Being worked</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Converted</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.converted}</div>
            <p className="text-xs text-muted-foreground">Signed leases</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.conversionRate}%</div>
            <p className="text-xs text-muted-foreground">Lead to lease</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LeadStatus | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="showing_scheduled">Showing Scheduled</option>
            <option value="application_started">Application Started</option>
            <option value="converted">Converted</option>
            <option value="lost">Lost</option>
          </select>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Leads List */}
      <div className="space-y-4">
        {filteredLeads.map((lead) => {
          const config = statusConfig[lead.status];

          return (
            <Card key={lead.id}>
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback>{getInitials(lead.firstName, lead.lastName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{lead.firstName} {lead.lastName}</h3>
                            {lead.jeevaEnabled && (
                              <Badge variant="outline" className="gap-1">
                                <Sparkles className="h-3 w-3" />
                                Jeeva.ai
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            {lead.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {lead.email}
                              </span>
                            )}
                            {lead.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {lead.phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant={config.variant}>{config.label}</Badge>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Budget</p>
                          <p className="font-medium">
                            {lead.budget ? `$${lead.budget.toLocaleString()}/mo` : 'Not specified'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Move-in</p>
                          <p className="font-medium">{lead.moveInTimeline || 'Not specified'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Source</p>
                          <p className="font-medium">{lead.source}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Contact Preference</p>
                          <p className="font-medium capitalize">{lead.preferredContact}</p>
                        </div>
                      </div>

                      {lead.listingAddress && (
                        <div className="flex items-center gap-2 text-sm">
                          <AlertCircle className="h-4 w-4 text-muted-foreground" />
                          Interested in: <span className="font-medium">{lead.listingAddress}</span>
                        </div>
                      )}

                      {lead.propertyPreferences?.neighborhoods && (
                        <div className="flex flex-wrap gap-1">
                          {lead.propertyPreferences.neighborhoods.map((n) => (
                            <Badge key={n} variant="secondary" className="text-xs">{n}</Badge>
                          ))}
                          {lead.propertyPreferences.bedrooms && (
                            <Badge variant="secondary" className="text-xs">
                              {lead.propertyPreferences.bedrooms} BR
                            </Badge>
                          )}
                        </div>
                      )}

                      {lead.nextFollowUpAt && (
                        <div className="flex items-center gap-2 text-sm text-amber-600">
                          <Calendar className="h-4 w-4" />
                          Follow up: {new Date(lead.nextFollowUpAt).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </div>
                      )}

                      {lead.notes && (
                        <p className="text-sm text-muted-foreground italic">"{lead.notes}"</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </Button>
                    {lead.status === 'new' && (
                      <Button size="sm">
                        <Send className="mr-2 h-4 w-4" />
                        Contact
                      </Button>
                    )}
                    {['contacted', 'qualified'].includes(lead.status) && (
                      <Button size="sm">
                        <Calendar className="mr-2 h-4 w-4" />
                        Schedule Showing
                      </Button>
                    )}
                    {lead.status === 'showing_scheduled' && (
                      <Button size="sm">
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Complete Showing
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredLeads.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No leads found</h3>
            <p className="text-muted-foreground">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Add your first lead to get started'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
