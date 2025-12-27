'use client';

import { useState, useEffect } from 'react';
import {
  CreditCard,
  Zap,
  Download,
  Target,
  FileText,
  Bell,
  Loader2,
  AlertCircle,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/header';
import { cn } from '@/lib/utils';
import { useRequireAuth } from '@/hooks';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface UsageData {
  scoringCalls: number;
  exports: number;
  apiCalls: number;
  leadsProcessed: number;
  toursScheduled: number;
  scoringLimit: number;
  exportsLimit: number;
  apiCallsLimit: number;
}

const DEMO_USAGE: UsageData = {
  scoringCalls: 127,
  exports: 8,
  apiCalls: 1543,
  leadsProcessed: 45,
  toursScheduled: 12,
  scoringLimit: 500,
  exportsLimit: 50,
  apiCallsLimit: 10000,
};

const PLAN_INFO = {
  name: 'Professional',
  price: 99,
  period: 'month',
  features: [
    '500 lead scoring calls/month',
    '50 CRM exports/month',
    '10,000 API calls/month',
    'Unlimited leads',
    'Email support',
    'Analytics dashboard',
  ],
};

export default function BillingPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const response = await fetch(`${API_BASE}/usage/me`);
        const data = await response.json();

        if (data.data) {
          setUsage(data.data);
          setIsDemoMode(false);
        } else {
          setUsage(DEMO_USAGE);
          setIsDemoMode(true);
        }
      } catch {
        setUsage(DEMO_USAGE);
        setIsDemoMode(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsage();
  }, []);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
      </div>
    );
  }

  const getUsagePercentage = (used: number, limit: number) => {
    return Math.min(100, Math.round((used / limit) * 100));
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-surface-900">Billing & Usage</h1>
          <p className="text-surface-600 mt-1">Manage your subscription and monitor usage</p>
        </div>

        {isDemoMode && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Demo Mode</p>
              <p className="text-sm text-amber-600">Showing sample billing data.</p>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Current Plan */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-luxury-bronze" />
                      Current Plan
                    </CardTitle>
                    <CardDescription>Your subscription details</CardDescription>
                  </div>
                  <Badge className="bg-luxury-gold text-white text-sm px-3 py-1">
                    {PLAN_INFO.name}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-4xl font-bold text-surface-900">${PLAN_INFO.price}</span>
                  <span className="text-surface-500">/{PLAN_INFO.period}</span>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  {PLAN_INFO.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm text-surface-700">{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 mt-6 pt-6 border-t">
                  <Button variant="outline">Change Plan</Button>
                  <Button variant="outline">Update Payment</Button>
                </div>
              </CardContent>
            </Card>

            {/* Usage Meters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-luxury-bronze" />
                  Usage This Month
                </CardTitle>
                <CardDescription>Resets on the 1st of each month</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {usage && (
                  <>
                    {/* Scoring Calls */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-surface-400" />
                          <span className="text-sm font-medium text-surface-700">Lead Scoring Calls</span>
                        </div>
                        <span className="text-sm text-surface-600">
                          {usage.scoringCalls.toLocaleString()} / {usage.scoringLimit.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            getUsageColor(getUsagePercentage(usage.scoringCalls, usage.scoringLimit))
                          )}
                          style={{ width: `${getUsagePercentage(usage.scoringCalls, usage.scoringLimit)}%` }}
                        />
                      </div>
                    </div>

                    {/* Exports */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Download className="h-4 w-4 text-surface-400" />
                          <span className="text-sm font-medium text-surface-700">CRM Exports</span>
                        </div>
                        <span className="text-sm text-surface-600">
                          {usage.exports} / {usage.exportsLimit}
                        </span>
                      </div>
                      <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            getUsageColor(getUsagePercentage(usage.exports, usage.exportsLimit))
                          )}
                          style={{ width: `${getUsagePercentage(usage.exports, usage.exportsLimit)}%` }}
                        />
                      </div>
                    </div>

                    {/* API Calls */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-surface-400" />
                          <span className="text-sm font-medium text-surface-700">API Calls</span>
                        </div>
                        <span className="text-sm text-surface-600">
                          {usage.apiCalls.toLocaleString()} / {usage.apiCallsLimit.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            getUsageColor(getUsagePercentage(usage.apiCalls, usage.apiCallsLimit))
                          )}
                          style={{ width: `${getUsagePercentage(usage.apiCalls, usage.apiCallsLimit)}%` }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Activity Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {usage && (
                  <>
                    <div className="flex items-center justify-between p-3 bg-surface-50 rounded-lg">
                      <span className="text-sm text-surface-600">Leads Processed</span>
                      <span className="font-semibold text-surface-900">{usage.leadsProcessed}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-surface-50 rounded-lg">
                      <span className="text-sm text-surface-600">Tours Scheduled</span>
                      <span className="font-semibold text-surface-900">{usage.toursScheduled}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-surface-50 rounded-lg">
                      <span className="text-sm text-surface-600">Scoring Accuracy</span>
                      <span className="font-semibold text-emerald-600">94%</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Billing History */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Billing History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { date: 'Dec 1, 2024', amount: 99, status: 'paid' },
                    { date: 'Nov 1, 2024', amount: 99, status: 'paid' },
                    { date: 'Oct 1, 2024', amount: 99, status: 'paid' },
                  ].map((invoice, i) => (
                    <div key={i} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium text-surface-900">{invoice.date}</p>
                        <p className="text-xs text-surface-500">${invoice.amount}.00</p>
                      </div>
                      <Badge variant="outline" className="text-emerald-600">
                        {invoice.status}
                      </Badge>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" className="w-full mt-4" size="sm">
                  <FileText className="h-4 w-4 mr-2" />
                  View All Invoices
                </Button>
              </CardContent>
            </Card>

            {/* Need Help */}
            <Card className="bg-gradient-to-br from-luxury-champagne/50 to-white">
              <CardContent className="p-6 text-center">
                <Bell className="h-8 w-8 text-luxury-bronze mx-auto mb-3" />
                <h3 className="font-semibold text-surface-900 mb-2">Need more?</h3>
                <p className="text-sm text-surface-600 mb-4">
                  Contact us for custom enterprise plans with unlimited usage.
                </p>
                <Button variant="outline" size="sm">
                  Contact Sales
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
