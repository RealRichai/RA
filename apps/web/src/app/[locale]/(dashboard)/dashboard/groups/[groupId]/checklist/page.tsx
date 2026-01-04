'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { ChecklistView, NonCustodialDisclaimer } from '@/components/co-purchase';
import { Button } from '@/components/ui/button';
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
}

export default function ChecklistPage() {
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

  const addItemMutation = useMutation({
    mutationFn: async ({ title, category }: { title: string; category: string }) => {
      await api.post(`/co-purchase/groups/${groupId}/checklist`, {
        title,
        category,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Task added',
        description: 'New task has been added to the checklist.',
      });
      void queryClient.invalidateQueries({ queryKey: ['co-purchase-group', groupId] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to add task. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      await api.patch(`/co-purchase/groups/${groupId}/checklist/${itemId}`, {
        status,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['co-purchase-group', groupId] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update task. Please try again.',
        variant: 'destructive',
      });
    },
  });

  if (isLoading || !group) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
        <div className="h-96 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  const currentMember = group.members.find((m) => m.userId === user?.id);
  const canEdit = currentMember?.role === 'organizer' || currentMember?.role === 'member';

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
          <h1 className="text-3xl font-bold">Shared Checklist</h1>
          <p className="text-muted-foreground">{group.name}</p>
        </div>
      </div>

      <NonCustodialDisclaimer compact />

      {/* Checklist */}
      <ChecklistView
        items={group.checklistItems}
        canEdit={canEdit}
        onAddItem={(title, category) => addItemMutation.mutate({ title, category })}
        onUpdateStatus={(itemId, status) => updateStatusMutation.mutate({ itemId, status })}
      />
    </div>
  );
}
