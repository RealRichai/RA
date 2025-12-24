'use client';

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/components/providers/theme-provider';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import api, { ApiClientError } from '@/lib/api-client';
import {
  User,
  Mail,
  Phone,
  Shield,
  Bell,
  Palette,
  Sun,
  Moon,
  Monitor,
  Save,
  Camera,
} from 'lucide-react';

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { mode, setTheme } = useTheme();

  const [profileData, setProfileData] = React.useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const response = await api.updateMe(profileData);
      updateUser(response.user);
      setSuccess('Profile updated successfully');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to update profile');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
          <CardDescription>
            Update your personal information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileUpdate} className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user?.avatarUrl} alt={user?.firstName} />
                <AvatarFallback className="text-xl">
                  {user ? getInitials(user.firstName, user.lastName) : '?'}
                </AvatarFallback>
              </Avatar>
              <Button type="button" variant="outline" size="sm">
                <Camera className="h-4 w-4 mr-2" />
                Change Photo
              </Button>
            </div>

            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 text-sm text-green-600 bg-green-50 dark:bg-green-950/30 rounded-md">
                {success}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={profileData.firstName}
                  onChange={(e) =>
                    setProfileData((prev) => ({ ...prev, firstName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={profileData.lastName}
                  onChange={(e) =>
                    setProfileData((prev) => ({ ...prev, lastName: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={user?.email || ''}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Contact support to change your email address
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={profileData.phone}
                onChange={(e) =>
                  setProfileData((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="+1 (555) 000-0000"
              />
            </div>

            <Button type="submit" loading={saving}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Theme Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Appearance
          </CardTitle>
          <CardDescription>
            Customize how RealRiches looks on your device
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Label>Theme</Label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setTheme('ivory-light')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  mode === 'ivory-light'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Sun className="h-6 w-6 mx-auto mb-2" />
                <span className="text-sm font-medium">Light</span>
              </button>
              <button
                onClick={() => setTheme('noir-dark')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  mode === 'noir-dark'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Moon className="h-6 w-6 mx-auto mb-2" />
                <span className="text-sm font-medium">Dark</span>
              </button>
              <button
                onClick={() => setTheme('system')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  mode === 'system'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Monitor className="h-6 w-6 mx-auto mb-2" />
                <span className="text-sm font-medium">System</span>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>
            Manage your password and security settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Password</p>
              <p className="text-sm text-muted-foreground">
                Last changed: Never
              </p>
            </div>
            <Button variant="outline">Change Password</Button>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div>
              <p className="font-medium">Two-Factor Authentication</p>
              <p className="text-sm text-muted-foreground">
                Add an extra layer of security
              </p>
            </div>
            <Button variant="outline">Enable 2FA</Button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Choose what notifications you receive
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <NotificationToggle
            label="Email Notifications"
            description="Receive updates via email"
            defaultChecked
          />
          <NotificationToggle
            label="SMS Notifications"
            description="Get text messages for urgent updates"
            defaultChecked={false}
          />
          <NotificationToggle
            label="Push Notifications"
            description="Browser notifications for real-time alerts"
            defaultChecked
          />
          <NotificationToggle
            label="Marketing Emails"
            description="News, tips, and promotions"
            defaultChecked={false}
          />
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible account actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete Account</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete your account and all data
              </p>
            </div>
            <Button variant="destructive">Delete Account</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationToggle({
  label,
  description,
  defaultChecked,
}: {
  label: string;
  description: string;
  defaultChecked?: boolean;
}) {
  const [checked, setChecked] = React.useState(defaultChecked);

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={() => setChecked(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
