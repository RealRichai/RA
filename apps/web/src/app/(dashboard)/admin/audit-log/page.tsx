'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Search,
  Filter,
  Download,
  Clock,
  User,
  Activity,
  Eye,
  Plus,
  Edit,
  Trash2,
  LogIn,
  LogOut,
  Settings,
  Shield,
  Flag,
  MapPin,
  Plug,
} from 'lucide-react';

type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout' | 'enable' | 'disable' | 'configure';
type EntityType = 'user' | 'listing' | 'application' | 'lease' | 'payment' | 'feature_flag' | 'market' | 'integration' | 'session';

interface AuditLog {
  id: string;
  userId?: string;
  userEmail?: string;
  action: AuditAction;
  entityType: EntityType;
  entityId?: string;
  entityName?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const actionConfig: Record<AuditAction, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  create: { label: 'Create', variant: 'default', icon: Plus },
  update: { label: 'Update', variant: 'secondary', icon: Edit },
  delete: { label: 'Delete', variant: 'destructive', icon: Trash2 },
  login: { label: 'Login', variant: 'outline', icon: LogIn },
  logout: { label: 'Logout', variant: 'outline', icon: LogOut },
  enable: { label: 'Enable', variant: 'default', icon: Activity },
  disable: { label: 'Disable', variant: 'secondary', icon: Activity },
  configure: { label: 'Configure', variant: 'outline', icon: Settings },
};

const entityIcons: Record<EntityType, React.ElementType> = {
  user: User,
  listing: FileText,
  application: FileText,
  lease: FileText,
  payment: FileText,
  feature_flag: Flag,
  market: MapPin,
  integration: Plug,
  session: Shield,
};

const mockAuditLogs: AuditLog[] = [
  {
    id: 'audit-1',
    userId: 'user-1',
    userEmail: 'admin@realriches.com',
    action: 'enable',
    entityType: 'feature_flag',
    entityId: 'ff-8',
    entityName: 'ai.listing-descriptions',
    createdAt: '2024-12-21T10:45:00Z',
    ipAddress: '192.168.1.100',
  },
  {
    id: 'audit-2',
    userId: 'user-1',
    userEmail: 'admin@realriches.com',
    action: 'configure',
    entityType: 'integration',
    entityId: 'int-6',
    entityName: 'anthropic',
    oldValue: { status: 'not-configured' },
    newValue: { status: 'configured' },
    createdAt: '2024-12-21T10:30:00Z',
    ipAddress: '192.168.1.100',
  },
  {
    id: 'audit-3',
    userId: 'user-3',
    userEmail: 'jennifer.martinez@email.com',
    action: 'create',
    entityType: 'application',
    entityId: 'app-123',
    entityName: '245 E 24th St, Unit 4B',
    createdAt: '2024-12-21T09:15:00Z',
    ipAddress: '203.0.113.42',
  },
  {
    id: 'audit-4',
    userId: 'user-2',
    userEmail: 'agent@realriches.com',
    action: 'update',
    entityType: 'listing',
    entityId: 'listing-1',
    entityName: '245 E 24th St, Unit 4B',
    oldValue: { rentPrice: 3400 },
    newValue: { rentPrice: 3500 },
    createdAt: '2024-12-21T08:00:00Z',
    ipAddress: '198.51.100.78',
  },
  {
    id: 'audit-5',
    userId: 'user-1',
    userEmail: 'admin@realriches.com',
    action: 'login',
    entityType: 'session',
    createdAt: '2024-12-21T07:30:00Z',
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  },
  {
    id: 'audit-6',
    userId: 'user-1',
    userEmail: 'admin@realriches.com',
    action: 'update',
    entityType: 'market',
    entityId: 'mkt-4',
    entityName: 'li-nassau',
    oldValue: { applicationFeeCap: 40 },
    newValue: { applicationFeeCap: 50 },
    createdAt: '2024-12-20T16:00:00Z',
    ipAddress: '192.168.1.100',
  },
  {
    id: 'audit-7',
    userId: 'user-1',
    userEmail: 'admin@realriches.com',
    action: 'delete',
    entityType: 'user',
    entityId: 'user-deleted',
    entityName: 'deleted.user@example.com',
    createdAt: '2024-12-20T14:30:00Z',
    ipAddress: '192.168.1.100',
  },
  {
    id: 'audit-8',
    userId: 'user-4',
    userEmail: 'david.kim@email.com',
    action: 'create',
    entityType: 'user',
    entityId: 'user-4',
    entityName: 'david.kim@email.com',
    metadata: { registrationSource: 'website' },
    createdAt: '2024-12-21T08:00:00Z',
    ipAddress: '172.16.0.45',
  },
  {
    id: 'audit-9',
    userId: 'user-2',
    userEmail: 'agent@realriches.com',
    action: 'create',
    entityType: 'lease',
    entityId: 'lease-new',
    entityName: '180 Montague St, Unit 12A',
    createdAt: '2024-12-20T11:00:00Z',
    ipAddress: '198.51.100.78',
  },
  {
    id: 'audit-10',
    userId: 'user-1',
    userEmail: 'admin@realriches.com',
    action: 'disable',
    entityType: 'feature_flag',
    entityId: 'ff-11',
    entityName: 'experimental.imessage',
    createdAt: '2024-12-19T15:00:00Z',
    ipAddress: '192.168.1.100',
  },
];

export default function AuditLogPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all');
  const [entityFilter, setEntityFilter] = useState<EntityType | 'all'>('all');

  const filteredLogs = mockAuditLogs.filter((log) => {
    const matchesSearch =
      log.userEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entityName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entityId?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesEntity = entityFilter === 'all' || log.entityType === entityFilter;
    return matchesSearch && matchesAction && matchesEntity;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatChanges = (oldValue?: Record<string, unknown>, newValue?: Record<string, unknown>) => {
    if (!oldValue && !newValue) return null;

    const changes: { key: string; old: unknown; new: unknown }[] = [];

    if (oldValue && newValue) {
      for (const key of Object.keys(newValue)) {
        if (oldValue[key] !== newValue[key]) {
          changes.push({ key, old: oldValue[key], new: newValue[key] });
        }
      }
    }

    return changes;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Audit Log</h2>
          <p className="text-sm text-muted-foreground">
            Track all administrative actions and changes
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Logs
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockAuditLogs.length}</div>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Creates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {mockAuditLogs.filter((l) => l.action === 'create').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Updates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {mockAuditLogs.filter((l) => l.action === 'update').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Deletes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {mockAuditLogs.filter((l) => l.action === 'delete').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by user, entity, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as AuditAction | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="enable">Enable</option>
            <option value="disable">Disable</option>
            <option value="configure">Configure</option>
          </select>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value as EntityType | 'all')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Entities</option>
            <option value="user">User</option>
            <option value="listing">Listing</option>
            <option value="application">Application</option>
            <option value="lease">Lease</option>
            <option value="payment">Payment</option>
            <option value="feature_flag">Feature Flag</option>
            <option value="market">Market</option>
            <option value="integration">Integration</option>
            <option value="session">Session</option>
          </select>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Audit Logs List */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {filteredLogs.map((log) => {
              const actionCfg = actionConfig[log.action];
              const ActionIcon = actionCfg.icon;
              const EntityIcon = entityIcons[log.entityType];
              const changes = formatChanges(log.oldValue, log.newValue);

              return (
                <div key={log.id} className="p-4 hover:bg-muted/50">
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                        <EntityIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant={actionCfg.variant}>
                              <ActionIcon className="mr-1 h-3 w-3" />
                              {actionCfg.label}
                            </Badge>
                            <Badge variant="outline" className="capitalize">
                              {log.entityType.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm">
                            <span className="font-medium">{log.userEmail}</span>
                            {' '}
                            {log.action === 'login' ? 'logged in' :
                             log.action === 'logout' ? 'logged out' :
                             `${log.action}d`}
                            {log.entityName && (
                              <>
                                {' '}
                                <span className="font-medium">{log.entityName}</span>
                              </>
                            )}
                          </p>
                        </div>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(log.createdAt)}
                        </span>
                      </div>

                      {changes && changes.length > 0 && (
                        <div className="p-2 bg-muted rounded-md text-sm">
                          <p className="font-medium text-xs text-muted-foreground mb-1">Changes:</p>
                          {changes.map((change) => (
                            <div key={change.key} className="flex gap-2">
                              <span className="font-mono">{change.key}:</span>
                              <span className="text-red-600 line-through">{String(change.old)}</span>
                              <span className="text-green-600">{String(change.new)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {log.ipAddress && (
                        <p className="text-xs text-muted-foreground">
                          IP: {log.ipAddress}
                          {log.userAgent && ` • ${log.userAgent.substring(0, 50)}...`}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {filteredLogs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No audit logs found</h3>
            <p className="text-muted-foreground">Try adjusting your filters</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
