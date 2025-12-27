'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  MapPin,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  MessageSquare,
  Home,
  Target,
  Edit3,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/header';
import { cn } from '@/lib/utils';
import { useRequireAuth } from '@/hooks';
import { toast } from '@/components/ui/toaster';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  score: number;
  tier: 'HOT' | 'WARM' | 'COLD';
  status: string;
  budget: number;
  moveInDate: string;
  neighborhoods: string[];
  bedrooms: number;
  createdAt: string;
  notes: string;
}

interface NurtureStep {
  id: string;
  day: number;
  action: string;
  channel: 'email' | 'sms' | 'call';
  status: 'pending' | 'completed' | 'skipped';
  scheduledFor: string;
  completedAt?: string;
}

const DEMO_LEAD: Lead = {
  id: 'lead-1',
  name: 'Sarah Chen',
  email: 'sarah.chen@example.com',
  phone: '(917) 555-1234',
  source: 'Website Inquiry',
  score: 92,
  tier: 'HOT',
  status: 'QUALIFIED',
  budget: 4500,
  moveInDate: '2025-02-01',
  neighborhoods: ['Upper East Side', 'Murray Hill'],
  bedrooms: 2,
  createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  notes: 'Looking for a pet-friendly building with doorman. Works in finance, prefers quick commute to Midtown.',
};

const DEMO_NURTURE_PLAN: NurtureStep[] = [
  {
    id: 'step-1',
    day: 0,
    action: 'Send welcome email with 5 matching listings',
    channel: 'email',
    status: 'completed',
    scheduledFor: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    completedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
  {
    id: 'step-2',
    day: 1,
    action: 'Follow-up call to discuss preferences',
    channel: 'call',
    status: 'completed',
    scheduledFor: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    completedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
  {
    id: 'step-3',
    day: 3,
    action: 'Send updated listings based on call feedback',
    channel: 'email',
    status: 'pending',
    scheduledFor: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: 'step-4',
    day: 5,
    action: 'Schedule tour for top 3 properties',
    channel: 'call',
    status: 'pending',
    scheduledFor: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
  {
    id: 'step-5',
    day: 7,
    action: 'Tour reminder SMS',
    channel: 'sms',
    status: 'pending',
    scheduledFor: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString(),
  },
];

const tierColors = {
  HOT: 'bg-red-100 text-red-700 border-red-200',
  WARM: 'bg-amber-100 text-amber-700 border-amber-200',
  COLD: 'bg-blue-100 text-blue-700 border-blue-200',
};

const channelIcons = {
  email: Mail,
  sms: MessageSquare,
  call: Phone,
};

export default function LeadDetailPage() {
  const params = useParams();
  const { isLoading: authLoading } = useRequireAuth();

  const [lead, setLead] = useState<Lead | null>(null);
  const [nurturePlan, setNurturePlan] = useState<NurtureStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [notes, setNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  useEffect(() => {
    const fetchLead = async () => {
      try {
        const [leadRes, planRes] = await Promise.all([
          fetch(`${API_BASE}/leads/${params.id}`),
          fetch(`${API_BASE}/leads/${params.id}/nurture-plan`),
        ]);

        const leadData = await leadRes.json();
        const planData = await planRes.json();

        if (leadData.data) {
          setLead(leadData.data);
          setNotes(leadData.data.notes || '');
          setIsDemoMode(false);
        } else {
          setLead(DEMO_LEAD);
          setNotes(DEMO_LEAD.notes);
          setIsDemoMode(true);
        }

        if (planData.data && planData.data.length > 0) {
          setNurturePlan(planData.data);
        } else {
          setNurturePlan(DEMO_NURTURE_PLAN);
        }
      } catch {
        setLead(DEMO_LEAD);
        setNotes(DEMO_LEAD.notes);
        setNurturePlan(DEMO_NURTURE_PLAN);
        setIsDemoMode(true);
      } finally {
        setIsLoading(false);
      }
    };

    if (params.id) {
      fetchLead();
    }
  }, [params.id]);

  const markStepComplete = (stepId: string) => {
    setNurturePlan((prev) =>
      prev.map((step) =>
        step.id === stepId
          ? { ...step, status: 'completed' as const, completedAt: new Date().toISOString() }
          : step
      )
    );
    toast({ title: 'Step marked as complete', variant: 'success' });
  };

  const saveNotes = () => {
    setIsEditingNotes(false);
    if (lead) {
      setLead({ ...lead, notes });
    }
    toast({ title: 'Notes saved', variant: 'success' });
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <Card className="py-16">
            <div className="text-center">
              <AlertCircle className="h-16 w-16 text-surface-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-surface-900 mb-2">Lead Not Found</h2>
              <p className="text-surface-600 mb-6">The requested lead could not be found.</p>
              <Button asChild>
                <Link href="/dashboard/leads">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Leads
                </Link>
              </Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  const completedSteps = nurturePlan.filter((s) => s.status === 'completed').length;
  const progress = (completedSteps / nurturePlan.length) * 100;

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Back Button */}
        <Button variant="ghost" className="mb-6" asChild>
          <Link href="/dashboard/leads">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Leads
          </Link>
        </Button>

        {isDemoMode && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Demo Mode</p>
              <p className="text-sm text-amber-600">Showing sample lead data.</p>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Lead Header */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-luxury-gold to-luxury-bronze flex items-center justify-center">
                      <User className="h-8 w-8 text-white" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold text-surface-900">{lead.name}</h1>
                      <p className="text-surface-500">Added {new Date(lead.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-surface-900">{lead.score}</p>
                      <p className="text-xs text-surface-500">Score</p>
                    </div>
                    <Badge className={cn('text-lg px-3 py-1', tierColors[lead.tier])}>
                      {lead.tier}
                    </Badge>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-surface-50 rounded-lg">
                    <Mail className="h-5 w-5 text-surface-400" />
                    <div>
                      <p className="text-xs text-surface-500">Email</p>
                      <p className="text-sm font-medium text-surface-900">{lead.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-surface-50 rounded-lg">
                    <Phone className="h-5 w-5 text-surface-400" />
                    <div>
                      <p className="text-xs text-surface-500">Phone</p>
                      <p className="text-sm font-medium text-surface-900">{lead.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-surface-50 rounded-lg">
                    <DollarSign className="h-5 w-5 text-surface-400" />
                    <div>
                      <p className="text-xs text-surface-500">Budget</p>
                      <p className="text-sm font-medium text-surface-900">${lead.budget.toLocaleString()}/mo</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-surface-50 rounded-lg">
                    <Calendar className="h-5 w-5 text-surface-400" />
                    <div>
                      <p className="text-xs text-surface-500">Move-in Date</p>
                      <p className="text-sm font-medium text-surface-900">
                        {new Date(lead.moveInDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-surface-50 rounded-lg">
                    <Home className="h-5 w-5 text-surface-400" />
                    <div>
                      <p className="text-xs text-surface-500">Bedrooms</p>
                      <p className="text-sm font-medium text-surface-900">{lead.bedrooms} BR</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-surface-50 rounded-lg">
                    <MapPin className="h-5 w-5 text-surface-400" />
                    <div>
                      <p className="text-xs text-surface-500">Neighborhoods</p>
                      <p className="text-sm font-medium text-surface-900">{lead.neighborhoods.join(', ')}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Nurture Plan */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-luxury-bronze" />
                      Nurture Plan
                    </CardTitle>
                    <CardDescription>Automated follow-up sequence</CardDescription>
                  </div>
                  <Badge variant="outline">
                    {completedSteps}/{nurturePlan.length} Complete
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Progress Bar */}
                <div className="mb-6">
                  <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-luxury-gold to-luxury-bronze rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-4">
                  {nurturePlan.map((step, index) => {
                    const ChannelIcon = channelIcons[step.channel];
                    const isCompleted = step.status === 'completed';
                    const isPending = step.status === 'pending';

                    return (
                      <div key={step.id} className="flex gap-4">
                        {/* Timeline Line */}
                        <div className="flex flex-col items-center">
                          <div
                            className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center',
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-600'
                                : 'bg-surface-100 text-surface-400'
                            )}
                          >
                            {isCompleted ? (
                              <CheckCircle className="h-5 w-5" />
                            ) : (
                              <Clock className="h-5 w-5" />
                            )}
                          </div>
                          {index < nurturePlan.length - 1 && (
                            <div className="w-0.5 h-12 bg-surface-200 mt-2" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 pb-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">
                                  Day {step.day}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  <ChannelIcon className="h-3 w-3 mr-1" />
                                  {step.channel}
                                </Badge>
                              </div>
                              <p className="font-medium text-surface-900">{step.action}</p>
                              <p className="text-xs text-surface-500 mt-1">
                                {isCompleted
                                  ? `Completed ${new Date(step.completedAt!).toLocaleDateString()}`
                                  : `Scheduled for ${new Date(step.scheduledFor).toLocaleDateString()}`}
                              </p>
                            </div>
                            {isPending && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => markStepComplete(step.id)}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Complete
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full">
                  <Phone className="h-4 w-4 mr-2" />
                  Call Lead
                </Button>
                <Button variant="outline" className="w-full">
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </Button>
                <Button variant="outline" className="w-full">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Send SMS
                </Button>
                <Button variant="outline" className="w-full">
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Tour
                </Button>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Notes</CardTitle>
                  {!isEditingNotes ? (
                    <Button variant="ghost" size="sm" onClick={() => setIsEditingNotes(true)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={saveNotes}>
                      <Save className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isEditingNotes ? (
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full h-32 p-3 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-luxury-gold"
                    placeholder="Add notes about this lead..."
                  />
                ) : (
                  <p className="text-sm text-surface-600">
                    {notes || 'No notes yet. Click edit to add.'}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Lead Source */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lead Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-surface-500">Source</span>
                  <span className="font-medium text-surface-900">{lead.source}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-500">Status</span>
                  <Badge variant="outline">{lead.status}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-500">Created</span>
                  <span className="font-medium text-surface-900">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
