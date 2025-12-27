'use client';

import { useState } from 'react';
import {
  User,
  Mail,
  Phone,
  Lock,
  Bell,
  CreditCard,
  Shield,
  Camera,
  Save,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useRequireAuth, useUpdateProfile } from '@/hooks';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/components/ui/toaster';

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'billing', label: 'Billing', icon: CreditCard },
];

function ProfileTab() {
  const { user } = useAuthStore();
  const updateProfile = useUpdateProfile();
  
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phone, setPhone] = useState(user?.phone || '');

  const handleSave = () => {
    updateProfile.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Photo</CardTitle>
          <CardDescription>Update your profile picture</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative">
              <UserAvatar user={user} size="xl" />
              <button className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-luxury-bronze text-white flex items-center justify-center hover:bg-luxury-bronze/90 transition-colors">
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <div>
              <Button variant="outline" size="sm">Upload New Photo</Button>
              <p className="text-xs text-surface-500 mt-2">JPG, PNG or GIF. Max 2MB.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your personal details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="First Name">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </FormField>
            <FormField label="Last Name">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Email Address" hint="Contact support to change your email">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
              <Input value={user?.email || ''} disabled className="pl-12 bg-surface-50" />
            </div>
          </FormField>
          <FormField label="Phone Number">
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
              <Input 
                type="tel" 
                placeholder="(212) 555-1234" 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)}
                className="pl-12" 
              />
            </div>
          </FormField>
          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} loading={updateProfile.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Type</CardTitle>
          <CardDescription>Your role on the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-surface-50 rounded-xl">
            <div>
              <p className="font-medium text-surface-900">{user?.role}</p>
              <p className="text-sm text-surface-500">
                {user?.role === 'TENANT' && 'Search and apply for rentals'}
                {user?.role === 'LANDLORD' && 'List and manage properties'}
                {user?.role === 'AGENT' && 'Help clients find homes'}
                {user?.role === 'INVESTOR' && 'Find investment opportunities'}
              </p>
            </div>
            <Badge variant="gold">{user?.subscriptionTier || 'FREE'}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'error' });
      return;
    }
    if (newPassword.length < 12) {
      toast({ title: 'Password must be at least 12 characters', variant: 'error' });
      return;
    }
    setIsChanging(true);
    await new Promise(r => setTimeout(r, 1000));
    toast({ title: 'Password updated successfully', variant: 'success' });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsChanging(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your password regularly for security</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Current Password">
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
              <Input 
                type={showPasswords ? 'text' : 'password'} 
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="pl-12" 
              />
            </div>
          </FormField>
          <FormField label="New Password" hint="Minimum 12 characters with uppercase, lowercase, and number">
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
              <Input 
                type={showPasswords ? 'text' : 'password'} 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pl-12 pr-12" 
              />
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
              >
                {showPasswords ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </FormField>
          <FormField label="Confirm New Password">
            <Input 
              type={showPasswords ? 'text' : 'password'} 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end pt-4">
            <Button onClick={handleChangePassword} loading={isChanging}>Update Password</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>Add an extra layer of security to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-surface-50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-surface-200 flex items-center justify-center">
                <Shield className="h-5 w-5 text-surface-500" />
              </div>
              <div>
                <p className="font-medium text-surface-900">Two-Factor Authentication</p>
                <p className="text-sm text-surface-500">Not enabled</p>
              </div>
            </div>
            <Button variant="outline">Enable</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>Manage devices where you're logged in</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-surface-50 rounded-xl">
              <div>
                <p className="font-medium text-surface-900">Current Device</p>
                <p className="text-sm text-surface-500">Chrome on MacOS • New York, NY</p>
              </div>
              <Badge variant="success">Active</Badge>
            </div>
          </div>
          <Button variant="outline" className="mt-4 w-full">Sign Out All Other Devices</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsTab() {
  const [emailNotifs, setEmailNotifs] = useState({
    applications: true,
    tours: true,
    messages: true,
    marketing: false,
  });

  const [pushNotifs, setPushNotifs] = useState({
    applications: true,
    tours: true,
    messages: true,
  });

  const handleSave = () => {
    toast({ title: 'Notification preferences saved', variant: 'success' });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Notifications</CardTitle>
          <CardDescription>Choose what emails you receive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'applications', label: 'Application Updates', desc: 'Status changes on your applications' },
            { key: 'tours', label: 'Tour Reminders', desc: 'Upcoming tour notifications and access codes' },
            { key: 'messages', label: 'New Messages', desc: 'Messages from landlords or tenants' },
            { key: 'marketing', label: 'Marketing & Tips', desc: 'New listings, tips, and platform updates' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-surface-900">{item.label}</p>
                <p className="text-sm text-surface-500">{item.desc}</p>
              </div>
              <button
                onClick={() => setEmailNotifs(prev => ({ ...prev, [item.key]: !prev[item.key as keyof typeof prev] }))}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors',
                  emailNotifs[item.key as keyof typeof emailNotifs] ? 'bg-luxury-bronze' : 'bg-surface-200'
                )}
              >
                <span className={cn(
                  'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform',
                  emailNotifs[item.key as keyof typeof emailNotifs] ? 'translate-x-7' : 'translate-x-1'
                )} />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Push Notifications</CardTitle>
          <CardDescription>Real-time alerts on your device</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'applications', label: 'Application Updates', desc: 'Instant status change alerts' },
            { key: 'tours', label: 'Tour Reminders', desc: '15-minute tour reminders' },
            { key: 'messages', label: 'New Messages', desc: 'Real-time message notifications' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-surface-900">{item.label}</p>
                <p className="text-sm text-surface-500">{item.desc}</p>
              </div>
              <button
                onClick={() => setPushNotifs(prev => ({ ...prev, [item.key]: !prev[item.key as keyof typeof prev] }))}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors',
                  pushNotifs[item.key as keyof typeof pushNotifs] ? 'bg-luxury-bronze' : 'bg-surface-200'
                )}
              >
                <span className={cn(
                  'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform',
                  pushNotifs[item.key as keyof typeof pushNotifs] ? 'translate-x-7' : 'translate-x-1'
                )} />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Save Preferences
        </Button>
      </div>
    </div>
  );
}

function BillingTab() {
  const { user } = useAuthStore();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>Manage your subscription</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-6 bg-gradient-to-br from-luxury-champagne/30 to-luxury-gold/10 rounded-xl border border-luxury-gold/20">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-display font-bold text-surface-900">
                  {user?.subscriptionTier || 'Free'} Plan
                </h3>
                <p className="text-surface-500">
                  {user?.subscriptionTier === 'FREE' 
                    ? 'Basic features included' 
                    : 'Full access to all features'}
                </p>
              </div>
              <Badge variant="gold">{user?.subscriptionTier || 'FREE'}</Badge>
            </div>
            {user?.subscriptionTier === 'FREE' && (
              <Button className="w-full">Upgrade to Premium</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
          <CardDescription>Manage your saved payment methods</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <CreditCard className="h-12 w-12 text-surface-300 mx-auto mb-3" />
            <p className="text-surface-500 mb-4">No payment methods saved</p>
            <Button variant="outline">Add Payment Method</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>View your past transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-surface-500">No billing history</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [activeTab, setActiveTab] = useState('profile');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="container-wide py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-12 w-64 bg-surface-200 rounded" />
            <div className="h-96 bg-surface-200 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />
      <main className="container-wide py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-900">Settings</h1>
          <p className="text-surface-500">Manage your account and preferences</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-64 shrink-0">
            <nav className="space-y-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors',
                    activeTab === tab.id
                      ? 'bg-luxury-champagne/50 text-luxury-bronze'
                      : 'text-surface-600 hover:bg-surface-100'
                  )}
                >
                  <tab.icon className="h-5 w-5" />
                  <span className="font-medium">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 max-w-2xl">
            {activeTab === 'profile' && <ProfileTab />}
            {activeTab === 'security' && <SecurityTab />}
            {activeTab === 'notifications' && <NotificationsTab />}
            {activeTab === 'billing' && <BillingTab />}
          </div>
        </div>
      </main>
    </div>
  );
}
