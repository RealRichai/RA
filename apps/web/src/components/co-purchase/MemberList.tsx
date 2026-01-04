'use client';

import { Shield, ShieldCheck, ShieldAlert, Clock, MoreVertical, Crown, User, Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Member {
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
}

interface MemberListProps {
  members: Member[];
  currentUserId?: string;
  isOrganizer?: boolean;
  _onUpdateRole?: (memberId: string, role: 'member' | 'viewer') => void;
  _onRemoveMember?: (memberId: string) => void;
  className?: string;
}

const roleConfig = {
  organizer: {
    label: 'Organizer',
    icon: Crown,
    color: 'text-amber-600 dark:text-amber-400',
  },
  member: {
    label: 'Member',
    icon: User,
    color: 'text-blue-600 dark:text-blue-400',
  },
  viewer: {
    label: 'Viewer',
    icon: Eye,
    color: 'text-gray-600 dark:text-gray-400',
  },
};

const verificationConfig = {
  not_started: {
    label: 'Not Started',
    icon: Shield,
    color: 'text-gray-400',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'text-amber-500',
  },
  in_progress: {
    label: 'In Progress',
    icon: Clock,
    color: 'text-blue-500',
  },
  verified: {
    label: 'Verified',
    icon: ShieldCheck,
    color: 'text-green-500',
  },
  failed: {
    label: 'Failed',
    icon: ShieldAlert,
    color: 'text-red-500',
  },
  expired: {
    label: 'Expired',
    icon: ShieldAlert,
    color: 'text-orange-500',
  },
};

export function MemberList({
  members,
  currentUserId,
  isOrganizer = false,
  _onUpdateRole,
  _onRemoveMember,
  className,
}: MemberListProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">Group Members</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {members.map((member) => {
            const roleInfo = roleConfig[member.role];
            const verificationInfo = verificationConfig[member.verificationStatus];
            const isCurrentUser = member.userId === currentUserId;
            const RoleIcon = roleInfo.icon;
            const VerificationIcon = verificationInfo.icon;

            return (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {member.user.firstName[0]}
                      {member.user.lastName[0]}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {member.user.firstName} {member.user.lastName}
                        {isCurrentUser && (
                          <span className="text-xs text-muted-foreground ml-1">(You)</span>
                        )}
                      </p>
                      <RoleIcon className={cn('h-4 w-4', roleInfo.color)} />
                    </div>
                    <p className="text-sm text-muted-foreground">{member.user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <VerificationIcon className={cn('h-4 w-4', verificationInfo.color)} />
                    <span className="text-xs text-muted-foreground">{verificationInfo.label}</span>
                  </div>
                  {isOrganizer && member.role !== 'organizer' && (
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
