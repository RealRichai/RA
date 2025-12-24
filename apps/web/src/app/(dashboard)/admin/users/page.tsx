'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Users,
  Search,
  Filter,
  Download,
  Plus,
  Eye,
  Edit,
  Ban,
  CheckCircle,
  Clock,
  XCircle,
  MoreHorizontal,
  Mail,
  Shield,
  UserCog,
} from 'lucide-react';

type UserRole = 'TENANT' | 'LANDLORD' | 'AGENT' | 'INVESTOR' | 'ADMIN' | 'SUPER_ADMIN';
type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  subscriptionTier: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

const roleColors: Record<UserRole, string> = {
  TENANT: 'bg-blue-500',
  LANDLORD: 'bg-green-500',
  AGENT: 'bg-purple-500',
  INVESTOR: 'bg-amber-500',
  ADMIN: 'bg-red-500',
  SUPER_ADMIN: 'bg-red-700',
};

const statusConfig: Record<UserStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  PENDING_VERIFICATION: { label: 'Pending', variant: 'outline', icon: Clock },
  ACTIVE: { label: 'Active', variant: 'default', icon: CheckCircle },
  SUSPENDED: { label: 'Suspended', variant: 'destructive', icon: Ban },
  DEACTIVATED: { label: 'Deactivated', variant: 'secondary', icon: XCircle },
};

const mockUsers: User[] = [
  {
    id: 'user-1',
    email: 'admin@realriches.com',
    firstName: 'System',
    lastName: 'Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    subscriptionTier: 'ENTERPRISE',
    emailVerified: true,
    phoneVerified: true,
    createdAt: '2024-01-01T00:00:00Z',
    lastLoginAt: '2024-12-21T10:30:00Z',
  },
  {
    id: 'user-2',
    email: 'agent@realriches.com',
    firstName: 'Demo',
    lastName: 'Agent',
    role: 'AGENT',
    status: 'ACTIVE',
    subscriptionTier: 'PROFESSIONAL',
    emailVerified: true,
    phoneVerified: true,
    createdAt: '2024-01-15T00:00:00Z',
    lastLoginAt: '2024-12-20T16:45:00Z',
  },
  {
    id: 'user-3',
    email: 'jennifer.martinez@email.com',
    firstName: 'Jennifer',
    lastName: 'Martinez',
    role: 'TENANT',
    status: 'ACTIVE',
    subscriptionTier: 'FREE',
    emailVerified: true,
    phoneVerified: false,
    createdAt: '2024-12-20T10:30:00Z',
    lastLoginAt: '2024-12-21T09:15:00Z',
  },
  {
    id: 'user-4',
    email: 'david.kim@email.com',
    firstName: 'David',
    lastName: 'Kim',
    role: 'TENANT',
    status: 'PENDING_VERIFICATION',
    subscriptionTier: 'FREE',
    emailVerified: false,
    phoneVerified: false,
    createdAt: '2024-12-21T08:00:00Z',
  },
  {
    id: 'user-5',
    email: 'landlord@realriches.com',
    firstName: 'Demo',
    lastName: 'Landlord',
    role: 'LANDLORD',
    status: 'ACTIVE',
    subscriptionTier: 'PROFESSIONAL',
    emailVerified: true,
    phoneVerified: true,
    createdAt: '2024-02-01T00:00:00Z',
    lastLoginAt: '2024-12-19T14:20:00Z',
  },
  {
    id: 'user-6',
    email: 'investor@realriches.com',
    firstName: 'Demo',
    lastName: 'Investor',
    role: 'INVESTOR',
    status: 'ACTIVE',
    subscriptionTier: 'PROFESSIONAL',
    emailVerified: true,
    phoneVerified: true,
    createdAt: '2024-03-01T00:00:00Z',
    lastLoginAt: '2024-12-18T11:00:00Z',
  },
  {
    id: 'user-7',
    email: 'suspended@example.com',
    firstName: 'Suspended',
    lastName: 'User',
    role: 'TENANT',
    status: 'SUSPENDED',
    subscriptionTier: 'FREE',
    emailVerified: true,
    phoneVerified: false,
    createdAt: '2024-10-01T00:00:00Z',
  },
];

export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');

  const filteredUsers = mockUsers.filter((user) => {
    const matchesSearch =
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">User Management</h2>
          <p className="text-sm text-muted-foreground">
            Manage user accounts, roles, and permissions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Roles</option>
            <option value="TENANT">Tenant</option>
            <option value="LANDLORD">Landlord</option>
            <option value="AGENT">Agent</option>
            <option value="INVESTOR">Investor</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as UserStatus | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="PENDING_VERIFICATION">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium">User</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Role</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Subscription</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Verified</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Last Login</th>
                  <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const statusCfg = statusConfig[user.status];
                  const StatusIcon = statusCfg.icon;

                  return (
                    <tr key={user.id} className="border-b">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {getInitials(user.firstName, user.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.firstName} {user.lastName}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="gap-1">
                          <span className={`h-2 w-2 rounded-full ${roleColors[user.role]}`} />
                          {user.role.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusCfg.variant}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusCfg.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">{user.subscriptionTier}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Badge variant={user.emailVerified ? 'default' : 'outline'} className="text-xs">
                            <Mail className="mr-1 h-3 w-3" />
                            {user.emailVerified ? 'Yes' : 'No'}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">
                          {user.lastLoginAt
                            ? new Date(user.lastLoginAt).toLocaleDateString()
                            : 'Never'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {filteredUsers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No users found</h3>
            <p className="text-muted-foreground">Try adjusting your filters</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
