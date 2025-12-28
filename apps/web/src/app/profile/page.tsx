'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api';
import Link from 'next/link';

interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  role: 'TENANT' | 'LANDLORD' | 'AGENT' | 'ADMIN';
  createdAt: string;
  emailVerified: boolean;
  phoneVerified: boolean;
}

function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: UserProfile }>('/users/me');
      return res.data;
    },
  });
}

function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<UserProfile>) => {
      const res = await apiClient.patch('/users/me', data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export default function ProfilePage() {
  const { user, isAuthenticated, logout } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center">
        <div className="card text-center">
          <h2 className="text-2xl font-display font-bold text-white mb-4">Sign In Required</h2>
          <p className="text-gray-400 mb-6">Please sign in to view your profile.</p>
          <Link href="/auth/login" className="btn-primary">Sign In</Link>
        </div>
      </div>
    );
  }

  const handleEdit = () => {
    if (profile) {
      setFormData({
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone || '',
      });
    }
    setIsEditing(true);
  };

  const handleSave = async () => {
    await updateProfile.mutateAsync(formData);
    setIsEditing(false);
  };

  const roleLabels = {
    TENANT: 'Tenant',
    LANDLORD: 'Landlord',
    AGENT: 'Real Estate Agent',
    ADMIN: 'Administrator',
  };

  const roleBadgeColors = {
    TENANT: 'bg-blue-500/20 text-blue-400',
    LANDLORD: 'bg-purple-500/20 text-purple-400',
    AGENT: 'bg-gold/20 text-gold',
    ADMIN: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="min-h-screen bg-charcoal">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-display font-bold text-white mb-8">My Profile</h1>

        {isLoading ? (
          <div className="card animate-pulse">
            <div className="h-24 w-24 rounded-full bg-gray-700 mx-auto mb-4" />
            <div className="h-6 bg-gray-700 rounded w-48 mx-auto mb-2" />
            <div className="h-4 bg-gray-700 rounded w-32 mx-auto" />
          </div>
        ) : profile ? (
          <div className="space-y-6">
            {/* Profile Header */}
            <div className="card text-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-teal to-gold mx-auto mb-4 flex items-center justify-center text-white text-3xl font-bold">
                {profile.firstName[0]}{profile.lastName[0]}
              </div>
              <h2 className="text-2xl font-display font-bold text-white">
                {profile.firstName} {profile.lastName}
              </h2>
              <p className="text-gray-400">{profile.email}</p>
              <div className="mt-2">
                <span className={`px-3 py-1 rounded-full text-sm ${roleBadgeColors[profile.role]}`}>
                  {roleLabels[profile.role]}
                </span>
              </div>
            </div>

            {/* Profile Details */}
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">Account Details</h3>
                {!isEditing && (
                  <button onClick={handleEdit} className="btn-secondary text-sm">
                    Edit Profile
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">First Name</label>
                      <input
                        type="text"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Last Name</label>
                      <input
                        type="text"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        className="input w-full"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="input w-full"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSave}
                      disabled={updateProfile.isPending}
                      className="btn-primary"
                    >
                      {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button onClick={() => setIsEditing(false)} className="btn-secondary">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400">First Name</label>
                      <p className="text-white">{profile.firstName}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400">Last Name</label>
                      <p className="text-white">{profile.lastName}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400">Email</label>
                    <div className="flex items-center gap-2">
                      <p className="text-white">{profile.email}</p>
                      {profile.emailVerified ? (
                        <span className="text-xs text-green-400 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Verified
                        </span>
                      ) : (
                        <button className="text-xs text-gold hover:underline">Verify Email</button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400">Phone</label>
                    <div className="flex items-center gap-2">
                      <p className="text-white">{profile.phone || 'Not provided'}</p>
                      {profile.phone && profile.phoneVerified && (
                        <span className="text-xs text-green-400 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Verified
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400">Member Since</label>
                    <p className="text-white">
                      {new Date(profile.createdAt).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Links */}
            <div className="card">
              <h3 className="text-xl font-semibold text-white mb-4">Quick Links</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link href="/applications" className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-teal/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-medium text-white">Applications</h4>
                      <p className="text-sm text-gray-400">View your rental applications</p>
                    </div>
                  </div>
                </Link>
                <Link href="/leases" className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-medium text-white">Leases</h4>
                      <p className="text-sm text-gray-400">Manage your lease agreements</p>
                    </div>
                  </div>
                </Link>
                <Link href="/payments" className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-medium text-white">Payments</h4>
                      <p className="text-sm text-gray-400">View payment history</p>
                    </div>
                  </div>
                </Link>
                <Link href="/messages" className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-medium text-white">Messages</h4>
                      <p className="text-sm text-gray-400">Contact landlords and agents</p>
                    </div>
                  </div>
                </Link>
              </div>
            </div>

            {/* Security Section */}
            <div className="card">
              <h3 className="text-xl font-semibold text-white mb-4">Security</h3>
              <div className="space-y-4">
                <button className="w-full p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-left flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <span className="text-white">Change Password</span>
                  </div>
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button className="w-full p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-left flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-white">Two-Factor Authentication</span>
                  </div>
                  <span className="text-sm text-gray-400">Not enabled</span>
                </button>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="card border border-red-500/30">
              <h3 className="text-xl font-semibold text-red-400 mb-4">Danger Zone</h3>
              <div className="space-y-4">
                <button
                  onClick={() => logout()}
                  className="w-full p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-left flex items-center gap-3 text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
                <button className="w-full p-4 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors text-left flex items-center gap-3 text-red-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="card text-center">
            <p className="text-gray-400">Unable to load profile. Please try again.</p>
          </div>
        )}
      </div>
    </div>
  );
}
