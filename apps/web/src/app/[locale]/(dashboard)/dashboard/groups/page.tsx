'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import Link from 'next/link';

import { GroupCard, NonCustodialDisclaimer } from '@/components/co-purchase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';

interface Group {
  id: string;
  name: string;
  description: string | null;
  status: 'forming' | 'verification' | 'document_collection' | 'ready' | 'archived';
  _count: {
    members: number;
    checklistItems: number;
    documents: number;
  };
  checklistProgress?: {
    completed: number;
    total: number;
  };
}

export default function GroupsPage() {
  const { data: groupsData, isLoading } = useQuery({
    queryKey: ['co-purchase-groups'],
    queryFn: async () => {
      const response = await api.get<{ groups: Group[] }>('/co-purchase/groups');
      return response.data?.groups || [];
    },
  });

  const groups = groupsData || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Co-Purchase Groups</h1>
          <p className="text-muted-foreground">
            Collaborate with others on property purchases
          </p>
        </div>
        <Link href="/dashboard/groups/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Group
          </Button>
        </Link>
      </div>

      {/* Non-Custodial Disclaimer */}
      <NonCustodialDisclaimer />

      {/* Groups List */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : groups.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              id={group.id}
              name={group.name}
              description={group.description}
              status={group.status}
              memberCount={group._count.members}
              checklistProgress={group.checklistProgress}
              documentCount={group._count.documents}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No groups yet</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              Create a co-purchase group to start collaborating with others on property purchases.
              Organize documents, track progress, and verify members together.
            </p>
            <Link href="/dashboard/groups/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Group
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
