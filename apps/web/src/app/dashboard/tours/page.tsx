'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  MapPin,
  Key,
  User,
  Phone,
  CheckCircle,
  XCircle,
  Building2,
  Copy,
  Mail,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, formatDate } from '@/lib/utils';
import { useRequireAuth } from '@/hooks';
import { useAuthStore, isLandlord, isTenant } from '@/stores/auth';
import { toast } from '@/components/ui/toaster';

const statusFilters = [
  { value: 'all', label: 'All Tours' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const mockToursTenant = [
  {
    id: 'tour1',
    listing: { id: 'l1', title: 'Stunning 2BR with Manhattan Skyline Views', address: '123 Bedford Ave, #4B, Brooklyn' },
    type: 'SELF_GUIDED' as const,
    scheduledAt: '2024-12-18T14:00:00Z',
    status: 'CONFIRMED',
    accessCode: '847291',
    duration: 30,
  },
  {
    id: 'tour2',
    listing: { id: 'l2', title: 'Spacious Studio in Historic Brownstone', address: '456 Park Place, Brooklyn' },
    type: 'AGENT_LED' as const,
    scheduledAt: '2024-12-20T11:00:00Z',
    status: 'SCHEDULED',
    agent: { name: 'Sarah Johnson', phone: '(212) 555-1234' },
    duration: 45,
  },
  {
    id: 'tour3',
    listing: { id: 'l3', title: 'Modern 1BR in Astoria', address: '30-15 Steinway St, #3F, Astoria' },
    type: 'SELF_GUIDED' as const,
    scheduledAt: '2024-12-10T10:00:00Z',
    status: 'COMPLETED',
    duration: 30,
  },
];

const mockToursLandlord = [
  {
    id: 'tour1',
    listing: { id: 'l1', title: '123 Bedford Ave, #4B' },
    tenant: { name: 'Michael Chen', email: 'michael@example.com', phone: '(917) 555-0123' },
    type: 'SELF_GUIDED' as const,
    scheduledAt: '2024-12-18T14:00:00Z',
    status: 'CONFIRMED',
  },
  {
    id: 'tour2',
    listing: { id: 'l1', title: '123 Bedford Ave, #4B' },
    tenant: { name: 'Emily Davis', email: 'emily@example.com', phone: '(646) 555-0456' },
    type: 'AGENT_LED' as const,
    scheduledAt: '2024-12-19T15:30:00Z',
    status: 'SCHEDULED',
    agent: { name: 'Sarah Johnson' },
  },
  {
    id: 'tour3',
    listing: { id: 'l2', title: '456 Park Place' },
    tenant: { name: 'James Wilson', email: 'james@example.com', phone: '(212) 555-0789' },
    type: 'SELF_GUIDED' as const,
    scheduledAt: '2024-12-20T10:00:00Z',
    status: 'SCHEDULED',
  },
];

function AccessCodeDialog({ tour, open, onClose }: { 
  tour: { id: string; accessCode?: string; listing: { title: string; address: string }; scheduledAt: string }; 
  open: boolean; 
  onClose: () => void;
}) {
  const copyCode = () => {
    if (tour.accessCode) {
      navigator.clipboard.writeText(tour.accessCode);
      toast({ title: 'Access code copied', variant: 'success' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your Access Code</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="text-center">
            <p className="text-sm text-surface-500 mb-2">{tour.listing.title}</p>
            <p className="text-xs text-surface-400">{tour.listing.address}</p>
          </div>
          
          <div className="p-6 bg-emerald-50 rounded-2xl text-center">
            <p className="text-sm text-emerald-600 mb-2">Access Code</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl font-mono font-bold text-emerald-700 tracking-widest">
                {tour.accessCode || '------'}
              </span>
              <button onClick={copyCode} className="p-2 rounded-lg hover:bg-emerald-100 transition-colors">
                <Copy className="h-5 w-5 text-emerald-600" />
              </button>
            </div>
          </div>

          <div className="p-4 bg-surface-50 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-surface-500" />
              <span className="text-sm font-medium text-surface-700">Valid Time Window</span>
            </div>
            <p className="text-sm text-surface-600">
              {formatDate(tour.scheduledAt, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
            <p className="text-xs text-surface-500 mt-1">Code is valid 15 minutes before and after your scheduled time</p>
          </div>

          <div className="p-4 bg-blue-50 rounded-xl">
            <p className="text-sm text-blue-800 font-medium mb-2">How to use:</p>
            <p className="text-sm text-blue-700">
              Go to the property entrance and enter the code on the smart lock keypad. The door will unlock automatically. Please lock the door when you leave.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TenantToursView() {
  const [filter, setFilter] = useState('all');
  const [selectedTour, setSelectedTour] = useState<typeof mockToursTenant[0] | null>(null);
  
  const tours = mockToursTenant;
  
  const filteredTours = tours.filter(tour => {
    if (filter === 'all') return true;
    if (filter === 'upcoming') return ['SCHEDULED', 'CONFIRMED'].includes(tour.status);
    if (filter === 'completed') return tour.status === 'COMPLETED';
    if (filter === 'cancelled') return tour.status === 'CANCELLED';
    return true;
  });

  const upcomingCount = tours.filter(t => ['SCHEDULED', 'CONFIRMED'].includes(t.status)).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-surface-900">My Tours</h1>
          <p className="text-surface-500">Manage your scheduled property tours</p>
        </div>
        <Button asChild>
          <Link href="/listings">Schedule New Tour</Link>
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">Upcoming Tours</p>
                <p className="text-3xl font-display font-bold text-surface-900">{upcomingCount}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-luxury-champagne/50 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-luxury-bronze" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">Completed</p>
                <p className="text-3xl font-display font-bold text-emerald-600">
                  {tours.filter(t => t.status === 'COMPLETED').length}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">Total Tours</p>
                <p className="text-3xl font-display font-bold text-surface-900">{tours.length}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-surface-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-surface-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Tours</CardTitle>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusFilters.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTours.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-surface-300 mx-auto mb-3" />
              <p className="text-surface-500">No tours found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTours.map(tour => {
                const isUpcoming = ['SCHEDULED', 'CONFIRMED'].includes(tour.status);
                
                return (
                  <div
                    key={tour.id}
                    className={cn(
                      'p-4 rounded-xl border transition-all',
                      isUpcoming ? 'border-luxury-gold/30 bg-luxury-champagne/10' : 'border-surface-100'
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          'h-12 w-12 rounded-xl flex items-center justify-center',
                          tour.type === 'SELF_GUIDED' ? 'bg-blue-100' : 'bg-purple-100'
                        )}>
                          {tour.type === 'SELF_GUIDED' ? (
                            <Key className="h-6 w-6 text-blue-600" />
                          ) : (
                            <User className="h-6 w-6 text-purple-600" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-semibold text-surface-900">{tour.listing.title}</h3>
                          <p className="text-sm text-surface-500 flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" />
                            {tour.listing.address}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-sm">
                            <span className="flex items-center gap-1 text-surface-600">
                              <Calendar className="h-3 w-3" />
                              {formatDate(tour.scheduledAt, { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                            <span className="flex items-center gap-1 text-surface-600">
                              <Clock className="h-3 w-3" />
                              {formatDate(tour.scheduledAt, { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                          {tour.type === 'AGENT_LED' && tour.agent && (
                            <p className="text-sm text-surface-500 mt-2">
                              Agent: {tour.agent.name} • {tour.agent.phone}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={
                          tour.status === 'CONFIRMED' ? 'success' :
                          tour.status === 'COMPLETED' ? 'default' :
                          tour.status === 'CANCELLED' ? 'error' : 'warning'
                        }>
                          {tour.status}
                        </Badge>
                        <Badge variant={tour.type === 'SELF_GUIDED' ? 'info' : 'default'}>
                          {tour.type === 'SELF_GUIDED' ? 'Self-Guided' : 'Agent-Led'}
                        </Badge>
                        {tour.type === 'SELF_GUIDED' && isUpcoming && tour.accessCode && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setSelectedTour(tour)}
                            className="mt-2"
                          >
                            <Key className="h-4 w-4 mr-1" />
                            View Code
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTour && (
        <AccessCodeDialog
          tour={selectedTour}
          open={!!selectedTour}
          onClose={() => setSelectedTour(null)}
        />
      )}
    </div>
  );
}

function LandlordToursView() {
  const [filter, setFilter] = useState('all');
  const tours = mockToursLandlord;
  
  const filteredTours = tours.filter(tour => {
    if (filter === 'all') return true;
    if (filter === 'upcoming') return ['SCHEDULED', 'CONFIRMED'].includes(tour.status);
    if (filter === 'completed') return tour.status === 'COMPLETED';
    if (filter === 'cancelled') return tour.status === 'CANCELLED';
    return true;
  });

  const todayTours = tours.filter(t => {
    const tourDate = new Date(t.scheduledAt);
    const today = new Date();
    return tourDate.toDateString() === today.toDateString() && ['SCHEDULED', 'CONFIRMED'].includes(t.status);
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-surface-900">Property Tours</h1>
          <p className="text-surface-500">View and manage scheduled tours for your properties</p>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">Today</p>
                <p className="text-2xl font-display font-bold text-surface-900">{todayTours.length}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-luxury-champagne/50 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-luxury-bronze" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">This Week</p>
                <p className="text-2xl font-display font-bold text-surface-900">
                  {tours.filter(t => ['SCHEDULED', 'CONFIRMED'].includes(t.status)).length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">Self-Guided</p>
                <p className="text-2xl font-display font-bold text-surface-900">
                  {tours.filter(t => t.type === 'SELF_GUIDED').length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Key className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-surface-500">Agent-Led</p>
                <p className="text-2xl font-display font-bold text-surface-900">
                  {tours.filter(t => t.type === 'AGENT_LED').length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <User className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Tours</CardTitle>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusFilters.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTours.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-surface-300 mx-auto mb-3" />
              <p className="text-surface-500">No tours scheduled</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Visitor</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Property</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Date & Time</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-surface-500">Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTours.map(tour => (
                    <tr key={tour.id} className="border-b border-surface-50 hover:bg-surface-50">
                      <td className="py-4 px-4">
                        <p className="font-medium text-surface-900">{tour.tenant.name}</p>
                        <p className="text-sm text-surface-500">{tour.tenant.email}</p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-surface-900">{tour.listing.title}</p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-surface-900">
                          {formatDate(tour.scheduledAt, { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <p className="text-sm text-surface-500">
                          {formatDate(tour.scheduledAt, { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </td>
                      <td className="py-4 px-4">
                        <Badge variant={tour.type === 'SELF_GUIDED' ? 'info' : 'default'}>
                          {tour.type === 'SELF_GUIDED' ? 'Self-Guided' : 'Agent-Led'}
                        </Badge>
                        {tour.type === 'AGENT_LED' && tour.agent && (
                          <p className="text-xs text-surface-500 mt-1">{tour.agent.name}</p>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <Badge variant={
                          tour.status === 'CONFIRMED' ? 'success' :
                          tour.status === 'CANCELLED' ? 'error' : 'warning'
                        }>
                          {tour.status}
                        </Badge>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a href={`tel:${tour.tenant.phone}`} className="p-2 rounded-lg hover:bg-surface-100 transition-colors">
                            <Phone className="h-4 w-4 text-surface-500" />
                          </a>
                          <a href={`mailto:${tour.tenant.email}`} className="p-2 rounded-lg hover:bg-surface-100 transition-colors">
                            <Mail className="h-4 w-4 text-surface-500" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ToursPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const { user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="container-wide py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-12 w-64 bg-surface-200 rounded" />
            <div className="grid md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-surface-200 rounded-2xl" />)}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />
      <main className="container-wide py-8">
        {isTenant(user) && <TenantToursView />}
        {isLandlord(user) && <LandlordToursView />}
      </main>
    </div>
  );
}
