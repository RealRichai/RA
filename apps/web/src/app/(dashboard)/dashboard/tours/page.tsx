'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  MapPin,
  Search,
  Filter,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  Eye,
  Edit,
  Key,
  Lock,
  Unlock,
  Phone,
  Mail,
  Navigation,
  Play,
  StopCircle,
  CalendarPlus,
  UserCheck,
} from 'lucide-react';

type TourStatus = 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

interface Tour {
  id: string;
  listingId: string;
  listingAddress: string;
  unit?: string;
  leadId?: string;
  leadName: string;
  leadPhone?: string;
  leadEmail?: string;
  status: TourStatus;
  scheduledAt: string;
  duration: number; // minutes
  accessCode?: string;
  accessCodeExpiry?: string;
  seamDeviceId?: string;
  notes?: string;
  feedback?: string;
  agentName?: string;
}

const statusConfig: Record<TourStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  scheduled: { label: 'Scheduled', variant: 'outline', icon: Calendar },
  confirmed: { label: 'Confirmed', variant: 'default', icon: CheckCircle },
  in_progress: { label: 'In Progress', variant: 'default', icon: Play },
  completed: { label: 'Completed', variant: 'secondary', icon: CheckCircle },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: XCircle },
  no_show: { label: 'No Show', variant: 'destructive', icon: AlertCircle },
};

const mockTours: Tour[] = [
  {
    id: 'tour-1',
    listingId: 'listing-1',
    listingAddress: '245 E 24th St',
    unit: '4B',
    leadId: 'lead-1',
    leadName: 'Jennifer Martinez',
    leadPhone: '+1 (212) 555-0123',
    leadEmail: 'jennifer.martinez@email.com',
    status: 'scheduled',
    scheduledAt: '2024-12-21T14:00:00Z',
    duration: 30,
    accessCode: '847291',
    accessCodeExpiry: '2024-12-21T15:00:00Z',
    seamDeviceId: 'seam_device_001',
    agentName: 'Sarah Agent',
  },
  {
    id: 'tour-2',
    listingId: 'listing-2',
    listingAddress: '180 Montague St',
    unit: '12A',
    leadId: 'lead-4',
    leadName: 'Robert Garcia',
    leadPhone: '+1 (718) 555-0456',
    status: 'confirmed',
    scheduledAt: '2024-12-21T15:30:00Z',
    duration: 45,
    notes: 'Client wants to see the roof deck as well',
    agentName: 'Mike Agent',
  },
  {
    id: 'tour-3',
    listingId: 'listing-3',
    listingAddress: '55-10 Queens Blvd',
    unit: '8C',
    leadName: 'Amanda Thompson',
    leadEmail: 'amanda.t@email.com',
    status: 'in_progress',
    scheduledAt: '2024-12-21T11:00:00Z',
    duration: 30,
    accessCode: '193847',
    seamDeviceId: 'seam_device_003',
    agentName: 'Sarah Agent',
  },
  {
    id: 'tour-4',
    listingId: 'listing-4',
    listingAddress: '890 Park Ave',
    unit: 'PH1',
    leadName: 'David Kim',
    leadPhone: '+1 (917) 555-0789',
    leadEmail: 'david.kim@email.com',
    status: 'completed',
    scheduledAt: '2024-12-20T10:00:00Z',
    duration: 60,
    feedback: 'Very interested, will submit application today',
    agentName: 'Mike Agent',
  },
  {
    id: 'tour-5',
    listingId: 'listing-5',
    listingAddress: '321 Grand St',
    unit: '2F',
    leadName: 'Michelle Lee',
    leadPhone: '+1 (646) 555-0321',
    status: 'cancelled',
    scheduledAt: '2024-12-19T16:00:00Z',
    duration: 30,
    notes: 'Rescheduled to next week',
    agentName: 'Sarah Agent',
  },
  {
    id: 'tour-6',
    listingId: 'listing-6',
    listingAddress: '456 Atlantic Ave',
    unit: '3A',
    leadName: 'Thomas Brown',
    leadEmail: 'thomas.b@email.com',
    status: 'no_show',
    scheduledAt: '2024-12-18T14:30:00Z',
    duration: 30,
    notes: 'No response to calls or texts',
    agentName: 'Mike Agent',
  },
];

export default function ToursPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TourStatus | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'all'>('all');

  const today = new Date();
  const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const filteredTours = mockTours.filter((tour) => {
    const matchesSearch =
      tour.listingAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tour.leadName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || tour.status === statusFilter;

    const tourDate = new Date(tour.scheduledAt);
    let matchesDate = true;
    if (dateFilter === 'today') {
      matchesDate = tourDate.toDateString() === today.toDateString();
    } else if (dateFilter === 'week') {
      matchesDate = tourDate >= today && tourDate <= weekFromNow;
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  const stats = {
    todaysTours: mockTours.filter((t) => {
      const tourDate = new Date(t.scheduledAt);
      return tourDate.toDateString() === today.toDateString() && ['scheduled', 'confirmed', 'in_progress'].includes(t.status);
    }).length,
    upcomingTours: mockTours.filter((t) => ['scheduled', 'confirmed'].includes(t.status)).length,
    completedToday: mockTours.filter((t) => {
      const tourDate = new Date(t.scheduledAt);
      return tourDate.toDateString() === today.toDateString() && t.status === 'completed';
    }).length,
    noShowRate: Math.round(
      (mockTours.filter((t) => t.status === 'no_show').length /
        mockTours.filter((t) => ['completed', 'no_show'].includes(t.status)).length) * 100
    ) || 0,
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tours</h1>
          <p className="text-muted-foreground">
            Manage property showings and smart lock access
          </p>
        </div>
        <Button>
          <CalendarPlus className="mr-2 h-4 w-4" />
          Schedule Tour
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today's Tours</CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todaysTours}</div>
            <p className="text-xs text-muted-foreground">Scheduled for today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.upcomingTours}</div>
            <p className="text-xs text-muted-foreground">Pending tours</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedToday}</div>
            <p className="text-xs text-muted-foreground">Showings done</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">No-Show Rate</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.noShowRate}%</div>
            <p className="text-xs text-muted-foreground">Of completed tours</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by address or lead name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as 'today' | 'week' | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TourStatus | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="confirmed">Confirmed</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No Show</option>
          </select>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tours List */}
      <div className="space-y-4">
        {filteredTours.map((tour) => {
          const config = statusConfig[tour.status];
          const StatusIcon = config.icon;
          const isUpcoming = ['scheduled', 'confirmed'].includes(tour.status);
          const isActive = tour.status === 'in_progress';

          return (
            <Card key={tour.id} className={isActive ? 'border-green-500 border-2' : ''}>
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback>{getInitials(tour.leadName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{tour.leadName}</h3>
                            {isActive && (
                              <Badge variant="default" className="bg-green-500">
                                <Play className="mr-1 h-3 w-3" />
                                Live
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            {tour.leadPhone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {tour.leadPhone}
                              </span>
                            )}
                            {tour.leadEmail && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {tour.leadEmail}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant={config.variant}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {config.label}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{tour.listingAddress}</span>
                        {tour.unit && <span className="text-muted-foreground">Unit {tour.unit}</span>}
                      </div>

                      <div className="grid gap-4 sm:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Date</p>
                          <p className="font-medium">{formatDate(tour.scheduledAt)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Time</p>
                          <p className="font-medium">{formatTime(tour.scheduledAt)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Duration</p>
                          <p className="font-medium">{tour.duration} min</p>
                        </div>
                        {tour.agentName && (
                          <div>
                            <p className="text-xs text-muted-foreground">Agent</p>
                            <p className="font-medium">{tour.agentName}</p>
                          </div>
                        )}
                      </div>

                      {tour.accessCode && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <Key className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Access Code:</span>
                          <code className="font-mono font-bold">{tour.accessCode}</code>
                          {tour.accessCodeExpiry && (
                            <span className="text-xs text-muted-foreground">
                              (Expires: {formatTime(tour.accessCodeExpiry)})
                            </span>
                          )}
                          {tour.seamDeviceId && (
                            <Badge variant="outline" className="ml-2">
                              <Lock className="mr-1 h-3 w-3" />
                              Seam Connected
                            </Badge>
                          )}
                        </div>
                      )}

                      {tour.notes && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium">Note:</span> {tour.notes}
                        </p>
                      )}

                      {tour.feedback && (
                        <div className="p-2 bg-green-50 dark:bg-green-950 rounded-md">
                          <p className="text-sm text-green-700 dark:text-green-300">
                            <span className="font-medium">Feedback:</span> {tour.feedback}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      Details
                    </Button>
                    {isUpcoming && (
                      <>
                        {tour.seamDeviceId && (
                          <Button variant="outline" size="sm">
                            <Unlock className="mr-2 h-4 w-4" />
                            Generate Code
                          </Button>
                        )}
                        <Button size="sm">
                          <Play className="mr-2 h-4 w-4" />
                          Start Tour
                        </Button>
                      </>
                    )}
                    {isActive && (
                      <Button size="sm" variant="destructive">
                        <StopCircle className="mr-2 h-4 w-4" />
                        End Tour
                      </Button>
                    )}
                    {tour.status === 'completed' && !tour.feedback && (
                      <Button size="sm">
                        <UserCheck className="mr-2 h-4 w-4" />
                        Add Feedback
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredTours.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No tours found</h3>
            <p className="text-muted-foreground">
              {searchQuery || statusFilter !== 'all' || dateFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Schedule your first tour to get started'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
