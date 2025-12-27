'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DemoModeState } from '@/components/ui/demo-mode-state';
import {
  Users,
  Search,
  Filter,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  Star,
  StarOff,
  TrendingUp,
  TrendingDown,
  Clock,
  Building2,
  DollarSign,
  MapPin,
  ChevronRight,
  MoreVertical,
  UserPlus,
  Download,
  Loader2,
  ArrowUpDown,
  Eye,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Header } from '@/components/layout/header';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { useRequireAuth } from '@/hooks';
import { useAuthStore, isAgent } from '@/stores/auth';

// =============================================================================
// TYPES
// =============================================================================

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'showing' | 'negotiating' | 'closed' | 'lost';
type LeadSource = 'website' | 'referral' | 'zillow' | 'streeteasy' | 'social' | 'other';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: LeadStatus;
  source: LeadSource;
  score: number; // 0-100
  budget: {
    min: number;
    max: number;
  };
  preferences: {
    bedrooms: number[];
    neighborhoods: string[];
    moveInDate?: string;
  };
  lastContact?: string;
  nextFollowUp?: string;
  notes?: string;
  assignedListings: string[];
  starred: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LeadActivity {
  id: string;
  leadId: string;
  type: 'call' | 'email' | 'text' | 'showing' | 'note';
  description: string;
  createdAt: string;
}

// =============================================================================
// MOCK DATA (would come from API)
// =============================================================================

const MOCK_LEADS: Lead[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    email: 'sarah.j@email.com',
    phone: '(212) 555-0123',
    status: 'qualified',
    source: 'website',
    score: 85,
    budget: { min: 3000, max: 4500 },
    preferences: {
      bedrooms: [1, 2],
      neighborhoods: ['Upper West Side', 'Midtown'],
      moveInDate: '2025-02-01',
    },
    lastContact: '2025-12-14T10:30:00Z',
    nextFollowUp: '2025-12-16T14:00:00Z',
    assignedListings: ['listing-1', 'listing-2'],
    starred: true,
    createdAt: '2025-12-01T08:00:00Z',
    updatedAt: '2025-12-14T10:30:00Z',
  },
  {
    id: '2',
    name: 'Michael Chen',
    email: 'mchen@techcorp.com',
    phone: '(646) 555-0456',
    status: 'showing',
    source: 'referral',
    score: 92,
    budget: { min: 5000, max: 7500 },
    preferences: {
      bedrooms: [2, 3],
      neighborhoods: ['Tribeca', 'SoHo', 'Chelsea'],
      moveInDate: '2025-01-15',
    },
    lastContact: '2025-12-15T09:00:00Z',
    nextFollowUp: '2025-12-15T16:00:00Z',
    notes: 'Looking for pet-friendly buildings. Has a golden retriever.',
    assignedListings: ['listing-3', 'listing-4', 'listing-5'],
    starred: true,
    createdAt: '2025-11-28T14:00:00Z',
    updatedAt: '2025-12-15T09:00:00Z',
  },
  {
    id: '3',
    name: 'Emily Rodriguez',
    email: 'emily.r@gmail.com',
    status: 'new',
    source: 'streeteasy',
    score: 45,
    budget: { min: 2000, max: 2800 },
    preferences: {
      bedrooms: [0, 1],
      neighborhoods: ['Astoria', 'Long Island City'],
    },
    assignedListings: [],
    starred: false,
    createdAt: '2025-12-15T06:00:00Z',
    updatedAt: '2025-12-15T06:00:00Z',
  },
  {
    id: '4',
    name: 'David Park',
    email: 'dpark@investment.com',
    phone: '(917) 555-0789',
    status: 'negotiating',
    source: 'zillow',
    score: 78,
    budget: { min: 4000, max: 5500 },
    preferences: {
      bedrooms: [2],
      neighborhoods: ['Brooklyn Heights', 'DUMBO', 'Park Slope'],
      moveInDate: '2025-02-15',
    },
    lastContact: '2025-12-13T15:00:00Z',
    nextFollowUp: '2025-12-16T10:00:00Z',
    notes: 'Relocating from SF for work. Company paying broker fee.',
    assignedListings: ['listing-6'],
    starred: false,
    createdAt: '2025-12-05T11:00:00Z',
    updatedAt: '2025-12-13T15:00:00Z',
  },
  {
    id: '5',
    name: 'Jessica Williams',
    email: 'jwilliams@law.com',
    phone: '(212) 555-0321',
    status: 'contacted',
    source: 'social',
    score: 62,
    budget: { min: 6000, max: 9000 },
    preferences: {
      bedrooms: [3],
      neighborhoods: ['Upper East Side', 'Gramercy'],
      moveInDate: '2025-03-01',
    },
    lastContact: '2025-12-10T12:00:00Z',
    assignedListings: ['listing-7', 'listing-8'],
    starred: false,
    createdAt: '2025-12-08T09:00:00Z',
    updatedAt: '2025-12-10T12:00:00Z',
  },
];

// =============================================================================
// STATUS CONFIGURATION
// =============================================================================

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; icon: React.ElementType }> = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-700', icon: UserPlus },
  contacted: { label: 'Contacted', color: 'bg-purple-100 text-purple-700', icon: Phone },
  qualified: { label: 'Qualified', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  showing: { label: 'Showing', color: 'bg-amber-100 text-amber-700', icon: Building2 },
  negotiating: { label: 'Negotiating', color: 'bg-orange-100 text-orange-700', icon: MessageSquare },
  closed: { label: 'Closed', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  lost: { label: 'Lost', color: 'bg-surface-100 text-surface-500', icon: XCircle },
};

const SOURCE_LABELS: Record<LeadSource, string> = {
  website: 'Website',
  referral: 'Referral',
  zillow: 'Zillow',
  streeteasy: 'StreetEasy',
  social: 'Social Media',
  other: 'Other',
};

// =============================================================================
// LEAD SCORE BADGE
// =============================================================================

function LeadScoreBadge({ score }: { score: number }) {
  const getScoreColor = () => {
    if (score >= 80) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (score >= 60) return 'bg-amber-100 text-amber-700 border-amber-200';
    if (score >= 40) return 'bg-orange-100 text-orange-700 border-orange-200';
    return 'bg-surface-100 text-surface-600 border-surface-200';
  };

  const getScoreIcon = () => {
    if (score >= 60) return TrendingUp;
    if (score >= 40) return AlertCircle;
    return TrendingDown;
  };

  const Icon = getScoreIcon();

  return (
    <div className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium', getScoreColor())}>
      <Icon className="h-3 w-3" />
      {score}
    </div>
  );
}

// =============================================================================
// LEAD CARD
// =============================================================================

function LeadCard({
  lead,
  onToggleStar,
  onStatusChange,
}: {
  lead: Lead;
  onToggleStar: (id: string) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
}) {
  const router = useRouter();
  const statusConfig = STATUS_CONFIG[lead.status];
  const StatusIcon = statusConfig.icon;

  const daysSinceContact = lead.lastContact
    ? Math.floor((Date.now() - new Date(lead.lastContact).getTime()) / 86400000)
    : null;

  const isOverdue = lead.nextFollowUp && new Date(lead.nextFollowUp) < new Date();

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Star + Avatar */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar(lead.id);
              }}
              className={cn(
                'p-1 rounded transition-colors',
                lead.starred ? 'text-amber-500' : 'text-surface-300 hover:text-surface-500'
              )}
            >
              {lead.starred ? <Star className="h-5 w-5 fill-current" /> : <StarOff className="h-5 w-5" />}
            </button>
            <div className="w-12 h-12 rounded-full bg-luxury-champagne flex items-center justify-center">
              <span className="text-lg font-semibold text-luxury-bronze">
                {lead.name.split(' ').map(n => n[0]).join('')}
              </span>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-surface-900 truncate">{lead.name}</h3>
                  <LeadScoreBadge score={lead.score} />
                </div>
                <p className="text-sm text-surface-500">{lead.email}</p>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge className={cn('text-xs', statusConfig.color)}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusConfig.label}
                </Badge>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push(`/dashboard/leads/${lead.id}`)}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => window.open(`tel:${lead.phone}`)}>
                      <Phone className="h-4 w-4 mr-2" />
                      Call
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.open(`mailto:${lead.email}`)}>
                      <Mail className="h-4 w-4 mr-2" />
                      Email
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Send Text
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onStatusChange(lead.id, 'lost')} className="text-red-600">
                      <XCircle className="h-4 w-4 mr-2" />
                      Mark as Lost
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Details Row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-surface-600 mb-3">
              <span className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                {formatCurrency(lead.budget.min)} - {formatCurrency(lead.budget.max)}
              </span>
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {lead.preferences.bedrooms.map(b => b === 0 ? 'Studio' : `${b}BR`).join(', ')}
              </span>
              {lead.preferences.neighborhoods.length > 0 && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {lead.preferences.neighborhoods.slice(0, 2).join(', ')}
                  {lead.preferences.neighborhoods.length > 2 && ` +${lead.preferences.neighborhoods.length - 2}`}
                </span>
              )}
            </div>

            {/* Activity + Next Steps */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-4">
                {lead.lastContact && (
                  <span className={cn(
                    'flex items-center gap-1',
                    daysSinceContact && daysSinceContact > 3 ? 'text-amber-600' : 'text-surface-500'
                  )}>
                    <Clock className="h-3.5 w-3.5" />
                    Last contact: {daysSinceContact === 0 ? 'Today' : daysSinceContact === 1 ? 'Yesterday' : `${daysSinceContact} days ago`}
                  </span>
                )}
                {lead.nextFollowUp && (
                  <span className={cn(
                    'flex items-center gap-1',
                    isOverdue ? 'text-red-600 font-medium' : 'text-surface-500'
                  )}>
                    <Calendar className="h-3.5 w-3.5" />
                    {isOverdue ? 'Overdue: ' : 'Follow-up: '}{formatDate(lead.nextFollowUp)}
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {lead.assignedListings.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {lead.assignedListings.length} listing{lead.assignedListings.length !== 1 ? 's' : ''}
                  </Badge>
                )}
                <Badge variant="default" className="text-xs">
                  {SOURCE_LABELS[lead.source]}
                </Badge>
              </div>
            </div>

            {/* Notes Preview */}
            {lead.notes && (
              <p className="text-xs text-surface-500 mt-2 line-clamp-1 italic">
                "{lead.notes}"
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export default function LeadsPage() {
  const router = useRouter();
  const { isLoading: authLoading } = useRequireAuth();
  const { user } = useAuthStore();

  const [leads, setLeads] = useState<Lead[]>(MOCK_LEADS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'score' | 'recent' | 'budget'>('score');
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Attempt to fetch leads from API
  useEffect(() => {
    const fetchLeads = async () => {
      try {
        const response = await fetch(`${API_BASE}/leads`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
          },
        });
        if (!response.ok) {
          throw new Error('API request failed');
        }
        const data = await response.json();
        if (data.data?.leads) {
          setLeads(data.data.leads);
        }
        setApiError(false);
      } catch {
        setApiError(true);
        setLeads(MOCK_LEADS);
      } finally {
        setIsLoadingData(false);
      }
    };
    fetchLeads();
  }, []);

  // Access control
  if (!authLoading && user && !isAgent(user)) {
    router.push('/dashboard');
    return null;
  }

  // Filter and sort leads
  const filteredLeads = useMemo(() => {
    return leads
      .filter((lead) => {
        if (showStarredOnly && !lead.starred) return false;
        if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
        if (sourceFilter !== 'all' && lead.source !== sourceFilter) return false;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            lead.name.toLowerCase().includes(query) ||
            lead.email.toLowerCase().includes(query) ||
            lead.phone?.includes(query)
          );
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'score':
            return b.score - a.score;
          case 'recent':
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          case 'budget':
            return b.budget.max - a.budget.max;
          default:
            return 0;
        }
      });
  }, [leads, searchQuery, statusFilter, sourceFilter, sortBy, showStarredOnly]);

  // Stats
  const stats = useMemo(() => ({
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    active: leads.filter(l => ['contacted', 'qualified', 'showing', 'negotiating'].includes(l.status)).length,
    closed: leads.filter(l => l.status === 'closed').length,
    avgScore: Math.round(leads.reduce((sum, l) => sum + l.score, 0) / leads.length),
  }), [leads]);

  const handleToggleStar = (id: string) => {
    setLeads(prev => prev.map(l => 
      l.id === id ? { ...l, starred: !l.starred } : l
    ));
  };

  const handleStatusChange = (id: string, status: LeadStatus) => {
    setLeads(prev => prev.map(l => 
      l.id === id ? { ...l, status, updatedAt: new Date().toISOString() } : l
    ));
  };

  if (authLoading || isLoadingData) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Demo Mode Banner */}
        {apiError && (
          <DemoModeState
            title="Lead Management"
            message="The leads API is not available. Showing demo data below."
            icon={Users}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-surface-900">Lead Management</h1>
            <p className="text-surface-600 mt-1">
              Manage and track your rental leads
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Lead
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-sm text-surface-500">Total Leads</p>
            <p className="text-2xl font-bold text-surface-900">{stats.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-surface-500">New</p>
            <p className="text-2xl font-bold text-blue-600">{stats.new}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-surface-500">Active</p>
            <p className="text-2xl font-bold text-amber-600">{stats.active}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-surface-500">Closed</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.closed}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-surface-500">Avg. Score</p>
            <p className="text-2xl font-bold text-luxury-bronze">{stats.avgScore}</p>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
            <Input
              placeholder="Search leads by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button
              variant={showStarredOnly ? 'default' : 'outline'}
              onClick={() => setShowStarredOnly(!showStarredOnly)}
              className="gap-2"
            >
              <Star className={cn('h-4 w-4', showStarredOnly && 'fill-current')} />
              Starred
            </Button>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>{config.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-36">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Lead Score</SelectItem>
                <SelectItem value="recent">Most Recent</SelectItem>
                <SelectItem value="budget">Budget (High)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Leads List */}
        {filteredLeads.length === 0 ? (
          <Card className="py-16">
            <div className="text-center">
              <Users className="h-16 w-16 text-surface-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-surface-900 mb-2">
                {leads.length === 0 ? 'No Leads Yet' : 'No Matching Leads'}
              </h2>
              <p className="text-surface-600 mb-6">
                {leads.length === 0
                  ? 'Start adding leads to track your rental prospects.'
                  : 'Try adjusting your filters to see more leads.'}
              </p>
              {leads.length === 0 ? (
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Your First Lead
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setStatusFilter('all');
                    setSourceFilter('all');
                    setSearchQuery('');
                    setShowStarredOnly(false);
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-surface-500">
              Showing {filteredLeads.length} of {leads.length} leads
            </p>
            {filteredLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onToggleStar={handleToggleStar}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
