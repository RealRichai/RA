'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { NonCustodialDisclaimer } from '@/components/co-purchase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';

interface CreateGroupResponse {
  group: {
    id: string;
    name: string;
  };
}

export default function NewGroupPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    targetPropertyType: 'residential',
    targetMarket: '',
    estimatedBudgetMin: '',
    estimatedBudgetMax: '',
  });

  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<CreateGroupResponse>('/co-purchase/groups', {
        name: formData.name,
        description: formData.description || undefined,
        targetPropertyType: formData.targetPropertyType,
        targetMarket: formData.targetMarket || undefined,
        estimatedBudgetMin: formData.estimatedBudgetMin
          ? Number(formData.estimatedBudgetMin)
          : undefined,
        estimatedBudgetMax: formData.estimatedBudgetMax
          ? Number(formData.estimatedBudgetMax)
          : undefined,
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Group created',
        description: 'Your co-purchase group has been created successfully.',
      });
      router.push(`/dashboard/groups/${data?.group.id}`);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create group. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disclaimerAccepted) {
      toast({
        title: 'Disclaimer required',
        description: 'Please acknowledge the non-custodial disclaimer to continue.',
        variant: 'destructive',
      });
      return;
    }
    createGroupMutation.mutate();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/groups">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Create Co-Purchase Group</h1>
          <p className="text-muted-foreground">
            Start a new group to collaborate on property purchases
          </p>
        </div>
      </div>

      {/* Non-Custodial Disclaimer */}
      <NonCustodialDisclaimer />

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Group Details</CardTitle>
            <CardDescription>
              Provide basic information about your co-purchase group
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Group Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Brooklyn Townhouse Collective"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                placeholder="Describe your group's goals and what you're looking for..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="targetPropertyType">Property Type</Label>
                <select
                  id="targetPropertyType"
                  value={formData.targetPropertyType}
                  onChange={(e) => setFormData({ ...formData, targetPropertyType: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="residential">Residential</option>
                  <option value="multi_family">Multi-Family</option>
                  <option value="commercial">Commercial</option>
                  <option value="mixed_use">Mixed Use</option>
                  <option value="land">Land</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetMarket">Target Market</Label>
                <Input
                  id="targetMarket"
                  placeholder="e.g., Brooklyn, NY"
                  value={formData.targetMarket}
                  onChange={(e) => setFormData({ ...formData, targetMarket: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budgetMin">Minimum Budget ($)</Label>
                <Input
                  id="budgetMin"
                  type="number"
                  placeholder="500,000"
                  value={formData.estimatedBudgetMin}
                  onChange={(e) => setFormData({ ...formData, estimatedBudgetMin: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="budgetMax">Maximum Budget ($)</Label>
                <Input
                  id="budgetMax"
                  type="number"
                  placeholder="1,000,000"
                  value={formData.estimatedBudgetMax}
                  onChange={(e) => setFormData({ ...formData, estimatedBudgetMax: e.target.value })}
                />
              </div>
            </div>

            {/* Disclaimer Acceptance */}
            <div className="border-t pt-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={disclaimerAccepted}
                  onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm text-muted-foreground">
                  I understand that RealRiches is a <strong>non-custodial platform</strong> that
                  does not hold funds, manage escrow, execute purchases, or provide investment
                  advice. I will work with licensed real estate professionals, attorneys, and
                  financial institutions for these services.
                </span>
              </label>
            </div>

            <div className="flex gap-4 pt-4">
              <Link href="/dashboard/groups" className="flex-1">
                <Button type="button" variant="outline" className="w-full">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                className="flex-1"
                disabled={!formData.name || !disclaimerAccepted || createGroupMutation.isPending}
              >
                {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
