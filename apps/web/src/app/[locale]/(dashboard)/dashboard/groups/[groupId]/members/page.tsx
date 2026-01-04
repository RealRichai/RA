'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { MemberList, NonCustodialDisclaimer } from '@/components/co-purchase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface GroupDetails {
  id: string;
  name: string;
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
  invitations: Array<{
    id: string;
    invitedEmail: string;
    role: 'member' | 'viewer';
    status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
    createdAt: string;
    expiresAt: string;
  }>;
}

export default function MembersPage() {
  const params = useParams();
  const groupId = params.groupId as string;
  const user = useAuthStore((state) => state.user);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('member');

  const { data: group, isLoading } = useQuery({
    queryKey: ['co-purchase-group', groupId],
    queryFn: async () => {
      const response = await api.get<{ group: GroupDetails }>(`/co-purchase/groups/${groupId}`);
      return response.data?.group;
    },
  });

  const sendInvitationMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/co-purchase/groups/${groupId}/invitations`, {
        email: inviteEmail,
        role: inviteRole,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Invitation sent',
        description: `An invitation has been sent to ${inviteEmail}`,
      });
      setInviteEmail('');
      setShowInviteForm(false);
      void queryClient.invalidateQueries({ queryKey: ['co-purchase-group', groupId] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to send invitation. Please try again.',
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
  const isOrganizer = currentMember?.role === 'organizer';
  const pendingInvitations = group.invitations?.filter((inv) => inv.status === 'pending') || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/groups/${groupId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Members</h1>
            <p className="text-muted-foreground">{group.name}</p>
          </div>
        </div>
        {isOrganizer && (
          <Button onClick={() => setShowInviteForm(!showInviteForm)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Member
          </Button>
        )}
      </div>

      <NonCustodialDisclaimer compact />

      {/* Invite Form */}
      {showInviteForm && isOrganizer && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invite New Member</CardTitle>
            <CardDescription>
              Send an invitation to join this co-purchase group
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="w-40 space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'member' | 'viewer')}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => sendInvitationMutation.mutate()}
                  disabled={!inviteEmail || sendInvitationMutation.isPending}
                >
                  {sendInvitationMutation.isPending ? 'Sending...' : 'Send Invite'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Pending Invitations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingInvitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{invitation.invitedEmail}</p>
                    <p className="text-sm text-muted-foreground">
                      Invited as {invitation.role} - Expires{' '}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 px-2 py-1 rounded-full">
                    Pending
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members List */}
      <MemberList
        members={group.members}
        currentUserId={user?.id}
        isOrganizer={isOrganizer}
      />
    </div>
  );
}
