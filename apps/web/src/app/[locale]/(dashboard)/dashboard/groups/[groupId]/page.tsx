'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Users,
  CheckSquare,
  FileText,
  Shield,
  Settings,
  Wallet,
  Landmark,
  TrendingUp,
  CreditCard,
  Home,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import {
  BlockedActionCard,
  ChecklistView,
  MemberList,
  NonCustodialDisclaimer,
} from '@/components/co-purchase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface GroupDetails {
  id: string;
  name: string;
  description: string | null;
  status: 'forming' | 'verification' | 'document_collection' | 'ready' | 'archived';
  targetPropertyType: string;
  targetMarket: string | null;
  estimatedBudgetMin: number | null;
  estimatedBudgetMax: number | null;
  members: Array<{
    id: string;
    userId: string;
    role: 'organizer' | 'member' | 'viewer';
    verificationStatus: 'not_started' | 'pending' | 'in_progress' | 'verified' | 'failed' | 'expired';
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
    joinedAt: string;
  }>;
  checklistItems: Array<{
    id: string;
    title: string;
    description: string | null;
    category: string;
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';
    assignedMember: {
      firstName: string;
      lastName: string;
    } | null;
    dueDate: string | null;
  }>;
  _count: {
    documents: number;
  };
}

const statusConfig = {
  forming: {
    label: 'Forming',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  },
  verification: {
    label: 'Verification',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
  },
  document_collection: {
    label: 'Collecting Documents',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  },
  ready: {
    label: 'Ready',
    color: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  },
  archived: {
    label: 'Archived',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  },
};

export default function GroupDetailPage() {
  const params = useParams();
  const groupId = params.groupId as string;
  const user = useAuthStore((state) => state.user);

  const { data: group, isLoading } = useQuery({
    queryKey: ['co-purchase-group', groupId],
    queryFn: async () => {
      const response = await api.get<{ group: GroupDetails }>(`/co-purchase/groups/${groupId}`);
      return response.data?.group;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
        <div className="h-32 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Group not found</h2>
        <Link href="/dashboard/groups">
          <Button variant="outline">Back to Groups</Button>
        </Link>
      </div>
    );
  }

  const statusInfo = statusConfig[group.status];
  const currentMember = group.members.find((m) => m.userId === user?.id);
  const isOrganizer = currentMember?.role === 'organizer';

  const completedTasks = group.checklistItems.filter((item) => item.status === 'completed').length;
  const verifiedMembers = group.members.filter((m) => m.verificationStatus === 'verified').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/groups">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{group.name}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
            {group.description && (
              <p className="text-muted-foreground">{group.description}</p>
            )}
          </div>
        </div>
        {isOrganizer && (
          <Link href={`/dashboard/groups/${groupId}/settings`}>
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </Link>
        )}
      </div>

      {/* Compact Disclaimer */}
      <NonCustodialDisclaimer compact />

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Link href={`/dashboard/groups/${groupId}/members`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{group.members.length}</div>
              <p className="text-xs text-muted-foreground">
                {verifiedMembers} verified
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/groups/${groupId}/checklist`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-muted-foreground" />
                Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {completedTasks}/{group.checklistItems.length}
              </div>
              <p className="text-xs text-muted-foreground">completed</p>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/groups/${groupId}/documents`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{group._count.documents}</div>
              <p className="text-xs text-muted-foreground">uploaded</p>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/groups/${groupId}/verification`}>
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Verification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round((verifiedMembers / group.members.length) * 100)}%
              </div>
              <p className="text-xs text-muted-foreground">complete</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Members */}
        <MemberList
          members={group.members}
          currentUserId={user?.id}
          isOrganizer={isOrganizer}
        />

        {/* Checklist Preview */}
        <ChecklistView
          items={group.checklistItems.slice(0, 5)}
          canEdit={isOrganizer || currentMember?.role === 'member'}
        />
      </div>

      {/* Blocked Features Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-muted-foreground">
          Custodial Services (Not Available)
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <BlockedActionCard
            title="Escrow Management"
            description="Hold and manage funds for property transactions"
            icon={Wallet}
          />
          <BlockedActionCard
            title="Funds Transfer"
            description="Transfer money between group members"
            icon={CreditCard}
          />
          <BlockedActionCard
            title="Investment Marketplace"
            description="Buy or sell investment shares in the group"
            icon={TrendingUp}
          />
          <BlockedActionCard
            title="Mortgage Processing"
            description="Apply for or manage group mortgages"
            icon={Landmark}
          />
          <BlockedActionCard
            title="Property Purchase"
            description="Execute property purchase transactions"
            icon={Home}
          />
        </div>
      </div>
    </div>
  );
}
