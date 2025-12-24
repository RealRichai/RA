'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Settings,
  Save,
  RefreshCw,
  Shield,
  Mail,
  Bell,
  Database,
  Key,
  Globe,
  Clock,
  AlertTriangle,
} from 'lucide-react';

interface SystemSetting {
  key: string;
  value: string | number | boolean | string[];
  description: string;
  category: string;
  type: 'string' | 'number' | 'boolean' | 'array';
}

const mockSettings: SystemSetting[] = [
  {
    key: 'platform.name',
    value: 'RealRiches',
    description: 'Platform display name',
    category: 'branding',
    type: 'string',
  },
  {
    key: 'platform.supportEmail',
    value: 'support@realriches.com',
    description: 'Support email address',
    category: 'contact',
    type: 'string',
  },
  {
    key: 'platform.defaultMarket',
    value: 'nyc-manhattan',
    description: 'Default market for new users',
    category: 'general',
    type: 'string',
  },
  {
    key: 'security.sessionDuration',
    value: 604800000,
    description: 'Session duration in milliseconds (7 days)',
    category: 'security',
    type: 'number',
  },
  {
    key: 'security.refreshTokenDuration',
    value: 2592000000,
    description: 'Refresh token duration in milliseconds (30 days)',
    category: 'security',
    type: 'number',
  },
  {
    key: 'security.maxLoginAttempts',
    value: 5,
    description: 'Maximum failed login attempts before lockout',
    category: 'security',
    type: 'number',
  },
  {
    key: 'security.lockoutDuration',
    value: 900000,
    description: 'Account lockout duration in milliseconds (15 minutes)',
    category: 'security',
    type: 'number',
  },
  {
    key: 'notifications.defaultChannels',
    value: ['email', 'in_app'],
    description: 'Default notification channels',
    category: 'notifications',
    type: 'array',
  },
  {
    key: 'leases.renewalNotificationDays',
    value: [90, 60, 30],
    description: 'Days before lease end to send renewal notifications',
    category: 'leases',
    type: 'array',
  },
  {
    key: 'compliance.fareActMaxApplicationFee',
    value: 20,
    description: 'Maximum application fee under FARE Act',
    category: 'compliance',
    type: 'number',
  },
  {
    key: 'compliance.fareActMaxSecurityDeposit',
    value: 1,
    description: 'Maximum security deposit months under FARE Act',
    category: 'compliance',
    type: 'number',
  },
];

const categoryLabels: Record<string, { label: string; icon: React.ElementType }> = {
  branding: { label: 'Branding', icon: Globe },
  contact: { label: 'Contact', icon: Mail },
  general: { label: 'General', icon: Settings },
  security: { label: 'Security', icon: Shield },
  notifications: { label: 'Notifications', icon: Bell },
  leases: { label: 'Leases', icon: Clock },
  compliance: { label: 'Compliance', icon: AlertTriangle },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(mockSettings);
  const [hasChanges, setHasChanges] = useState(false);

  const groupedSettings = settings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {} as Record<string, SystemSetting[]>);

  const handleSettingChange = (key: string, value: string) => {
    setSettings((prev) =>
      prev.map((s) => {
        if (s.key === key) {
          let parsedValue: string | number | boolean | string[] = value;
          if (s.type === 'number') {
            parsedValue = parseInt(value, 10) || 0;
          } else if (s.type === 'boolean') {
            parsedValue = value === 'true';
          } else if (s.type === 'array') {
            parsedValue = value.split(',').map((v) => v.trim());
          }
          return { ...s, value: parsedValue };
        }
        return s;
      })
    );
    setHasChanges(true);
  };

  const handleSave = () => {
    // In production, this would call the API
    setHasChanges(false);
    alert('Settings saved successfully!');
  };

  const handleReset = () => {
    setSettings(mockSettings);
    setHasChanges(false);
  };

  const formatValue = (setting: SystemSetting): string => {
    if (Array.isArray(setting.value)) {
      return setting.value.join(', ');
    }
    return String(setting.value);
  };

  const formatDuration = (ms: number): string => {
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds} seconds`;
    const minutes = seconds / 60;
    if (minutes < 60) return `${minutes} minutes`;
    const hours = minutes / 60;
    if (hours < 24) return `${hours} hours`;
    const days = hours / 24;
    return `${days} days`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">System Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure platform-wide settings and defaults
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} disabled={!hasChanges}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>

      {hasChanges && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            You have unsaved changes. Click "Save Changes" to apply them.
          </p>
        </div>
      )}

      {/* Settings by Category */}
      {Object.entries(groupedSettings).map(([category, categorySettings]) => {
        const categoryInfo = categoryLabels[category] || { label: category, icon: Settings };
        const CategoryIcon = categoryInfo.icon;

        return (
          <Card key={category}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CategoryIcon className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="capitalize">{categoryInfo.label}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {categorySettings.map((setting) => (
                  <div key={setting.key} className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={setting.key} className="font-medium">
                        {setting.key}
                      </Label>
                      <Badge variant="outline" className="text-xs">
                        {setting.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{setting.description}</p>
                    <div className="flex gap-2">
                      {setting.type === 'boolean' ? (
                        <select
                          id={setting.key}
                          value={String(setting.value)}
                          onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="true">Enabled</option>
                          <option value="false">Disabled</option>
                        </select>
                      ) : (
                        <Input
                          id={setting.key}
                          type={setting.type === 'number' ? 'number' : 'text'}
                          value={formatValue(setting)}
                          onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                          className="max-w-md"
                        />
                      )}
                      {setting.type === 'number' && setting.key.includes('Duration') && (
                        <span className="text-sm text-muted-foreground self-center">
                          ({formatDuration(setting.value as number)})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions that affect the entire platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Clear All Cache</p>
              <p className="text-sm text-muted-foreground">
                Clear all cached data including sessions and API responses
              </p>
            </div>
            <Button variant="outline" className="text-red-600 border-red-600 hover:bg-red-50">
              Clear Cache
            </Button>
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Reset Feature Flags</p>
              <p className="text-sm text-muted-foreground">
                Reset all feature flags to their default values
              </p>
            </div>
            <Button variant="outline" className="text-red-600 border-red-600 hover:bg-red-50">
              Reset Flags
            </Button>
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Terminate All Sessions</p>
              <p className="text-sm text-muted-foreground">
                Log out all users from the platform immediately
              </p>
            </div>
            <Button variant="destructive">
              Terminate Sessions
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Environment Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Environment Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Environment</p>
              <p className="font-medium">Development</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">API Version</p>
              <p className="font-medium">v2.0.0</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Node Version</p>
              <p className="font-medium">20.10.0</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Database</p>
              <p className="font-medium">PostgreSQL 15</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
