'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { NonCustodialDisclaimer } from '@/components/co-purchase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

interface GroupDetails {
  id: string;
  name: string;
  members: Array<{
    id: string;
    userId: string;
    role: 'organizer' | 'member' | 'viewer';
    verificationStatus: 'not_started' | 'pending' | 'in_progress' | 'verified' | 'failed' | 'expired';
    verifiedAt: string | null;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  }>;
}

const verificationConfig = {
  not_started: {
    label: 'Not Started',
    description: 'Identity verification has not been initiated',
    icon: Shield,
    color: 'text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
  pending: {
    label: 'Pending',
    description: 'Waiting for verification to begin',
    icon: Clock,
    color: 'text-amber-500',
    bgColor: 'bg-amber-100 dark:bg-amber-950',
  },
  in_progress: {
    label: 'In Progress',
    description: 'Verification is being processed',
    icon: Clock,
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-950',
  },
  verified: {
    label: 'Verified',
    description: 'Identity has been successfully verified',
    icon: ShieldCheck,
    color: 'text-green-500',
    bgColor: 'bg-green-100 dark:bg-green-950',
  },
  failed: {
    label: 'Failed',
    description: 'Verification could not be completed',
    icon: ShieldAlert,
    color: 'text-red-500',
    bgColor: 'bg-red-100 dark:bg-red-950',
  },
  expired: {
    label: 'Expired',
    description: 'Verification has expired, please re-verify',
    icon: ShieldAlert,
    color: 'text-orange-500',
    bgColor: 'bg-orange-100 dark:bg-orange-950',
  },
};

export default function VerificationPage() {
  const params = useParams();
  const groupId = params.groupId as string;
  const user = useAuthStore((state) => state.user);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: group, isLoading } = useQuery({
    queryKey: ['co-purchase-group', groupId],
    queryFn: async () => {
      const response = await api.get<{ group: GroupDetails }>(`/co-purchase/groups/${groupId}`);
      return response.data?.group;
    },
  });

  const initiateVerificationMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/co-purchase/groups/${groupId}/verification/initiate`);
    },
    onSuccess: () => {
      toast({
        title: 'Verification initiated',
        description: 'Your identity verification process has started.',
      });
      void queryClient.invalidateQueries({ queryKey: ['co-purchase-group', groupId] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to initiate verification. Please try again.',
        variant: 'destructive',
      });
    },
  });

  if (isLoading || !group) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  const currentMember = group.members.find((m) => m.userId === user?.id);
  const verifiedCount = group.members.filter((m) => m.verificationStatus === 'verified').length;
  const progressPercent = Math.round((verifiedCount / group.members.length) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/groups/${groupId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Member Verification</h1>
          <p className="text-muted-foreground">{group.name}</p>
        </div>
      </div>

      <NonCustodialDisclaimer compact />

      {/* Progress Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Verification Progress
          </CardTitle>
          <CardDescription>
            {verifiedCount} of {group.members.length} members verified
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            <span className="text-2xl font-bold">{progressPercent}%</span>
          </div>
        </CardContent>
      </Card>

      {/* Your Verification Status */}
      {currentMember && (
        <Card>
          <CardHeader>
            <CardTitle>Your Verification Status</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const config = verificationConfig[currentMember.verificationStatus];
              const StatusIcon = config.icon;
              return (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center',
                        config.bgColor
                      )}
                    >
                      <StatusIcon className={cn('h-6 w-6', config.color)} />
                    </div>
                    <div>
                      <p className="font-semibold">{config.label}</p>
                      <p className="text-sm text-muted-foreground">{config.description}</p>
                    </div>
                  </div>
                  {(currentMember.verificationStatus === 'not_started' ||
                    currentMember.verificationStatus === 'failed' ||
                    currentMember.verificationStatus === 'expired') && (
                    <Button
                      onClick={() => initiateVerificationMutation.mutate()}
                      disabled={initiateVerificationMutation.isPending}
                    >
                      {initiateVerificationMutation.isPending
                        ? 'Initiating...'
                        : 'Start Verification'}
                    </Button>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* All Members Status */}
      <Card>
        <CardHeader>
          <CardTitle>All Members</CardTitle>
          <CardDescription>Verification status for each group member</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {group.members.map((member) => {
              const config = verificationConfig[member.verificationStatus];
              const StatusIcon = config.icon;
              const isCurrentUser = member.userId === user?.id;

              return (
                <div
                  key={member.id}
                  className={cn('flex items-center justify-between p-4 rounded-lg', config.bgColor)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/50 dark:bg-black/20 flex items-center justify-center">
                      <span className="text-sm font-medium">
                        {member.user.firstName[0]}
                        {member.user.lastName[0]}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">
                        {member.user.firstName} {member.user.lastName}
                        {isCurrentUser && (
                          <span className="text-xs text-muted-foreground ml-1">(You)</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">{member.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusIcon className={cn('h-5 w-5', config.color)} />
                    <span className="text-sm font-medium">{config.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                About Identity Verification
              </h4>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Identity verification helps establish trust between group members. We use
                third-party verification providers and only store verification result hashes -
                we never store your personal documents or sensitive PII.
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Verification is optional but recommended for groups planning significant purchases.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
