'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Edit,
  Ban,
  Trash2,
  Mail,
  Calendar,
  Building2,
  Shield,
  CheckCircle,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Header } from '@/components/layout/header';
import { cn } from '@/lib/utils';
import { useRequireAuth } from '@/hooks';
import { useAuthStore } from '@/stores/auth';

type UserRole = 'TENANT' | 'LANDLORD' | 'AGENT' | 'INVESTOR' | 'ADMIN';
type UserStatus = 'active' | 'pending' | 'suspended' | 'deactivated';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  createdAt: string;
  lastActiveAt: string;
  listings?: number;
  applications?: number;
}

const MOCK_USERS: User[] = [
  {
    id: '1',
    firstName: 'Sarah',
    lastName: 'Johnson',
    email: 'sarah.johnson@email.com',
    role: 'LANDLORD',
    status: 'active',
    createdAt: '2024-01-15',
    lastActiveAt: '2024-12-25',
    listings: 8,
  },
  {
    id: '2',
    firstName: 'Michael',
    lastName: 'Chen',
    email: 'michael.chen@email.com',
    role: 'TENANT',
    status: 'active',
    createdAt: '2024-03-22',
    lastActiveAt: '2024-12-24',
    applications: 3,
  },
  {
    id: '3',
    firstName: 'Emily',
    lastName: 'Davis',
    email: 'emily.davis@realty.com',
    role: 'AGENT',
    status: 'active',
    createdAt: '2023-11-08',
    lastActiveAt: '2024-12-25',
    listings: 24,
  },
  {
    id: '4',
    firstName: 'James',
    lastName: 'Wilson',
    email: 'james.wilson@invest.co',
    role: 'INVESTOR',
    status: 'active',
    createdAt: '2024-02-14',
    lastActiveAt: '2024-12-23',
  },
  {
    id: '5',
    firstName: 'Amanda',
    lastName: 'Martinez',
    email: 'amanda.m@email.com',
    role: 'TENANT',
    status: 'pending',
    createdAt: '2024-12-20',
    lastActiveAt: '2024-12-20',
  },
  {
    id: '6',
    firstName: 'David',
    lastName: 'Brown',
    email: 'david.brown@properties.com',
    role: 'LANDLORD',
    status: 'suspended',
    createdAt: '2024-06-05',
    lastActiveAt: '2024-11-15',
    listings: 2,
  },
  {
    id: '7',
    firstName: 'Jennifer',
    lastName: 'Taylor',
    email: 'j.taylor@email.com',
    role: 'TENANT',
    status: 'active',
    createdAt: '2024-08-12',
    lastActiveAt: '2024-12-22',
    applications: 5,
  },
  {
    id: '8',
    firstName: 'Robert',
    lastName: 'Anderson',
    email: 'r.anderson@admin.com',
    role: 'ADMIN',
    status: 'active',
    createdAt: '2023-06-01',
    lastActiveAt: '2024-12-25',
  },
];

const roleConfig: Record<UserRole, { label: string; color: string; icon: React.ElementType }> = {
  TENANT: { label: 'Tenant', color: 'bg-blue-100 text-blue-700', icon: Users },
  LANDLORD: { label: 'Landlord', color: 'bg-purple-100 text-purple-700', icon: Building2 },
  AGENT: { label: 'Agent', color: 'bg-amber-100 text-amber-700', icon: Users },
  INVESTOR: { label: 'Investor', color: 'bg-emerald-100 text-emerald-700', icon: Building2 },
  ADMIN: { label: 'Admin', color: 'bg-red-100 text-red-700', icon: Shield },
};

const statusConfig: Record<UserStatus, { label: string; color: string; icon: React.ElementType }> = {
  active: { label: 'Active', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
  suspended: { label: 'Suspended', color: 'bg-red-100 text-red-700', icon: Ban },
  deactivated: { label: 'Deactivated', color: 'bg-surface-100 text-surface-500', icon: Ban },
};

function UserRow({ user }: { user: User }) {
  const StatusIcon = statusConfig[user.status].icon;

  return (
    <tr className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
      <td className="py-4 px-4">
        <div className="flex items-center gap-3">
          <UserAvatar
            user={{ firstName: user.firstName, lastName: user.lastName, avatarUrl: user.avatar }}
            size="sm"
          />
          <div>
            <p className="font-medium text-surface-900">{user.firstName} {user.lastName}</p>
            <p className="text-sm text-surface-500">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="py-4 px-4">
        <Badge className={cn('text-xs', roleConfig[user.role].color)}>
          {roleConfig[user.role].label}
        </Badge>
      </td>
      <td className="py-4 px-4">
        <Badge className={cn('text-xs', statusConfig[user.status].color)}>
          <StatusIcon className="h-3 w-3 mr-1" />
          {statusConfig[user.status].label}
        </Badge>
      </td>
      <td className="py-4 px-4 text-sm text-surface-600">
        {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </td>
      <td className="py-4 px-4 text-sm text-surface-600">
        {new Date(user.lastActiveAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </td>
      <td className="py-4 px-4 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Eye className="h-4 w-4 mr-2" />
              View Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Edit className="h-4 w-4 mr-2" />
              Edit User
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Mail className="h-4 w-4 mr-2" />
              Send Email
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {user.status === 'active' ? (
              <DropdownMenuItem className="text-amber-600">
                <Ban className="h-4 w-4 mr-2" />
                Suspend User
              </DropdownMenuItem>
            ) : user.status === 'suspended' ? (
              <DropdownMenuItem className="text-emerald-600">
                <CheckCircle className="h-4 w-4 mr-2" />
                Reactivate User
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem className="text-red-600">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete User
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const { isLoading: authLoading } = useRequireAuth();
  const { user } = useAuthStore();

  const [users] = useState<User[]>(MOCK_USERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch = !searchQuery ||
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  const paginatedUsers = filteredUsers.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filteredUsers.length / perPage);

  const stats = {
    total: users.length,
    active: users.filter(u => u.status === 'active').length,
    pending: users.filter(u => u.status === 'pending').length,
    suspended: users.filter(u => u.status === 'suspended').length,
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-surface-900">User Management</h1>
            <p className="text-surface-600 mt-1">
              Manage platform users and their permissions
            </p>
          </div>

          <Button>
            <UserPlus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-surface-100">
                <Users className="h-5 w-5 text-surface-600" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Total Users</p>
                <p className="text-lg font-bold text-surface-900">{stats.total}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Active</p>
                <p className="text-lg font-bold text-emerald-600">{stats.active}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Pending</p>
                <p className="text-lg font-bold text-amber-600">{stats.pending}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <Ban className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-surface-500">Suspended</p>
                <p className="text-lg font-bold text-red-600">{stats.suspended}</p>
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex gap-2">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="TENANT">Tenant</SelectItem>
                    <SelectItem value="LANDLORD">Landlord</SelectItem>
                    <SelectItem value="AGENT">Agent</SelectItem>
                    <SelectItem value="INVESTOR">Investor</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="deactivated">Deactivated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {paginatedUsers.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-surface-100">
                        <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">User</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Role</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Status</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Joined</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-surface-500">Last Active</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-surface-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map(user => (
                        <UserRow key={user.id} user={user} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <p className="text-sm text-surface-500">
                      Showing {(page - 1) * perPage + 1} to {Math.min(page * perPage, filteredUsers.length)} of {filteredUsers.length} users
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-surface-600">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-surface-300 mx-auto mb-3" />
                <p className="text-surface-500 mb-2">No users found</p>
                <p className="text-sm text-surface-400">
                  {searchQuery || roleFilter !== 'all' || statusFilter !== 'all'
                    ? 'Try adjusting your filters'
                    : 'No users have been added yet'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
