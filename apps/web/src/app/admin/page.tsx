'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { serverFetch, formatCurrency, formatDate } from '@/lib/api';
import Link from 'next/link';

interface DashboardStats {
  users: { total: number; tenants: number; landlords: number; agents: number; };
  listings: { total: number; active: number; pending: number; };
  applications: { total: number; pending: number; approved: number; rejected: number; };
  payments: { total: number; volume: number; pending: number; };
  compliance: { fareActDisclosures: number; fchaAssessments: number; };
}

interface RecentActivity {
  id: string;
  type: 'USER' | 'LISTING' | 'APPLICATION' | 'PAYMENT' | 'COMPLIANCE';
  action: string;
  description: string;
  userId?: string;
  userName?: string;
  createdAt: string;
}

interface FeatureToggle {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: 'CORE' | 'COMPLIANCE' | 'INTEGRATIONS' | 'EXPERIMENTAL';
}

export default function AdminDashboardPage() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'features' | 'compliance'>('overview');

  const isAdmin = user?.role === 'ADMIN';

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => serverFetch<{ stats: DashboardStats }>('/admin/stats'),
    enabled: isAuthenticated && isAdmin,
  });

  const { data: activity } = useQuery({
    queryKey: ['admin-activity'],
    queryFn: () => serverFetch<{ activities: RecentActivity[] }>('/admin/activity?limit=20'),
    enabled: isAuthenticated && isAdmin,
  });

  const { data: features } = useQuery({
    queryKey: ['admin-features'],
    queryFn: () => serverFetch<{ features: FeatureToggle[] }>('/admin/features'),
    enabled: isAuthenticated && isAdmin && activeTab === 'features',
  });

  const toggleFeature = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      serverFetch(`/admin/features/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-features'] });
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-display font-semibold text-charcoal mb-4">Sign In Required</h2>
          <p className="text-gray-600 mb-6">Please sign in to access the admin dashboard.</p>
          <Link href="/auth/login" className="btn-primary">Sign In</Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-display font-semibold text-charcoal mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-6">You don't have permission to access this page.</p>
          <Link href="/" className="btn-primary">Go Home</Link>
        </div>
      </div>
    );
  }

  const ACTIVITY_ICONS: Record<string, string> = {
    USER: '👤',
    LISTING: '🏠',
    APPLICATION: '📋',
    PAYMENT: '💳',
    COMPLIANCE: '✓',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-charcoal">Admin Dashboard</h1>
          <p className="text-gray-600 mt-2">Platform management and monitoring</p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: '📊' },
            { id: 'users', label: 'Users', icon: '👥' },
            { id: 'features', label: 'Features', icon: '⚙️' },
            { id: 'compliance', label: 'Compliance', icon: '✓' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-teal text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Stats Grid */}
            {statsLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-500">Total Users</div>
                      <div className="text-3xl font-bold text-charcoal mt-1">
                        {stats?.stats.users.total.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-3xl">👥</div>
                  </div>
                  <div className="mt-4 flex gap-4 text-sm">
                    <span className="text-gray-500">T: {stats?.stats.users.tenants}</span>
                    <span className="text-gray-500">L: {stats?.stats.users.landlords}</span>
                    <span className="text-gray-500">A: {stats?.stats.users.agents}</span>
                  </div>
                </div>

                <div className="card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-500">Active Listings</div>
                      <div className="text-3xl font-bold text-teal mt-1">
                        {stats?.stats.listings.active.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-3xl">🏠</div>
                  </div>
                  <div className="mt-4 text-sm text-gray-500">
                    {stats?.stats.listings.pending} pending approval
                  </div>
                </div>

                <div className="card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-500">Applications</div>
                      <div className="text-3xl font-bold text-charcoal mt-1">
                        {stats?.stats.applications.total.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-3xl">📋</div>
                  </div>
                  <div className="mt-4 flex gap-4 text-sm">
                    <span className="text-yellow-600">{stats?.stats.applications.pending} pending</span>
                    <span className="text-green-600">{stats?.stats.applications.approved} approved</span>
                  </div>
                </div>

                <div className="card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-500">Payment Volume</div>
                      <div className="text-3xl font-bold text-gold mt-1">
                        {formatCurrency(stats?.stats.payments.volume || 0)}
                      </div>
                    </div>
                    <div className="text-3xl">💰</div>
                  </div>
                  <div className="mt-4 text-sm text-gray-500">
                    {stats?.stats.payments.total} transactions
                  </div>
                </div>
              </div>
            )}

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Recent Activity */}
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-charcoal mb-4">Recent Activity</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {activity?.activities?.map(item => (
                    <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="text-xl">{ACTIVITY_ICONS[item.type]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-charcoal font-medium">{item.action}</p>
                        <p className="text-xs text-gray-500 truncate">{item.description}</p>
                        <p className="text-xs text-gray-400 mt-1">{formatDate(item.createdAt)}</p>
                      </div>
                    </div>
                  )) || (
                    <p className="text-gray-500 text-center py-8">No recent activity</p>
                  )}
                </div>
              </div>

              {/* Compliance Overview */}
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-charcoal mb-4">Compliance Status</h3>
                
                <div className="space-y-4">
                  {/* FARE Act */}
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">✓</span>
                        <span className="font-medium text-charcoal">FARE Act Compliance</span>
                      </div>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        Active
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {stats?.stats.compliance.fareActDisclosures.toLocaleString()} disclosures generated
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Effective June 14, 2025 • $20 max application fee
                    </p>
                  </div>

                  {/* FCHA */}
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">✓</span>
                        <span className="font-medium text-charcoal">Fair Chance Housing Act</span>
                      </div>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        Active
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {stats?.stats.compliance.fchaAssessments.toLocaleString()} Article 23-A assessments
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Effective Jan 1, 2025 • 5-factor scoring system
                    </p>
                  </div>

                  {/* Local Law 18 */}
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">✓</span>
                        <span className="font-medium text-charcoal">Local Law 18 of 2024</span>
                      </div>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        Active
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Application fee capped at $20
                    </p>
                  </div>

                  {/* Security Deposit */}
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">✓</span>
                        <span className="font-medium text-charcoal">Security Deposit Limit</span>
                      </div>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        Active
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Max 1 month rent for deposits
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-charcoal">User Management</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search users..."
                  className="input w-64"
                />
                <select className="input w-40">
                  <option value="">All Roles</option>
                  <option value="TENANT">Tenants</option>
                  <option value="LANDLORD">Landlords</option>
                  <option value="AGENT">Agents</option>
                  <option value="ADMIN">Admins</option>
                </select>
              </div>
            </div>
            
            <div className="text-center py-12 text-gray-500">
              User management table will be loaded here.
              <br />
              <span className="text-sm">Features: Search, filter, suspend, verify, export</span>
            </div>
          </div>
        )}

        {/* Features Tab */}
        {activeTab === 'features' && (
          <div className="space-y-6">
            {['CORE', 'COMPLIANCE', 'INTEGRATIONS', 'EXPERIMENTAL'].map(category => (
              <div key={category} className="card p-6">
                <h3 className="text-lg font-semibold text-charcoal mb-4 capitalize">
                  {category.toLowerCase().replace('_', ' ')} Features
                </h3>
                <div className="space-y-4">
                  {features?.features
                    ?.filter(f => f.category === category)
                    .map(feature => (
                      <div 
                        key={feature.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <h4 className="font-medium text-charcoal">{feature.name}</h4>
                          <p className="text-sm text-gray-500">{feature.description}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={feature.enabled}
                            onChange={(e) => toggleFeature.mutate({ 
                              id: feature.id, 
                              enabled: e.target.checked 
                            })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal"></div>
                        </label>
                      </div>
                    )) || (
                      <p className="text-gray-500 text-center py-4">No features in this category</p>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Compliance Tab */}
        {activeTab === 'compliance' && (
          <div className="space-y-6">
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-charcoal mb-4">Audit Log</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-gray-500 border-b">
                      <th className="pb-3">Timestamp</th>
                      <th className="pb-3">Event Type</th>
                      <th className="pb-3">User</th>
                      <th className="pb-3">Resource</th>
                      <th className="pb-3">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        Audit log entries will be displayed here.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-charcoal mb-4">FCHA Assessments</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Assessments</span>
                    <span className="font-semibold">{stats?.stats.compliance.fchaAssessments || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Approved (≥3.0 score)</span>
                    <span className="font-semibold text-green-600">--</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Denied (&lt;3.0 score)</span>
                    <span className="font-semibold text-red-600">--</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Average Score</span>
                    <span className="font-semibold">--</span>
                  </div>
                </div>
              </div>

              <div className="card p-6">
                <h3 className="text-lg font-semibold text-charcoal mb-4">Fee Compliance</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Application Fees Collected</span>
                    <span className="font-semibold">{formatCurrency(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Average Application Fee</span>
                    <span className="font-semibold">{formatCurrency(20)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Fee Cap Violations</span>
                    <span className="font-semibold text-green-600">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">FARE Act Disclosures</span>
                    <span className="font-semibold">{stats?.stats.compliance.fareActDisclosures || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
