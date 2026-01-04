'use client';

import { useQuery } from '@tanstack/react-query';
import {
  FileArchive,
  Upload,
  CheckCircle2,
  Clock,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FolderTree,
  MissingDocAlert,
  UpsellCard,
  EvidenceLog,
  VaultOnboardingWizard,
  type VaultOnboardingState,
  type UpsellTrigger,
  type VaultFolder,
  type DocumentCategory,
} from '@/components/vault';
import { api } from '@/lib/api';

interface VaultStatusResponse {
  data: VaultOnboardingState;
}

interface VaultUpsellsResponse {
  data: UpsellTrigger[];
}

export default function VaultPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;

  const { data: vaultStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['vault-status', propertyId],
    queryFn: async () => {
      const response = await api.get<VaultStatusResponse>(
        `/properties/${propertyId}/vault/status`
      );
      return response.data?.data;
    },
  });

  const { data: upsells } = useQuery({
    queryKey: ['vault-upsells', propertyId],
    queryFn: async () => {
      const response = await api.get<VaultUpsellsResponse>(
        `/properties/${propertyId}/vault/upsells`
      );
      return response.data?.data ?? [];
    },
    enabled: !!vaultStatus,
  });

  if (isLoadingStatus) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Property Vault</h1>
        </div>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">Loading vault...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Vault not initialized
  if (!vaultStatus) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Property Vault</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileArchive className="h-5 w-5" />
              Initialize Property Vault
            </CardTitle>
            <CardDescription>
              Create a secure document vault for this property
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                A property vault helps you organize and securely store all
                important documents like deeds, insurance policies, permits,
                and leases. Get started by initializing your vault.
              </p>
              <Link href={`/dashboard/properties/${propertyId}/vault/initialize`}>
                <Button>
                  <FileArchive className="h-4 w-4 mr-2" />
                  Initialize Vault
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Vault in progress - show wizard
  if (vaultStatus.status === 'in_progress') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Property Vault Setup</h1>
            <p className="text-muted-foreground">
              Complete the guided setup to organize your documents
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-amber-600 dark:text-amber-400">
              In Progress
            </span>
          </div>
        </div>

        <VaultOnboardingWizard state={vaultStatus} />

        {/* Upsells */}
        {upsells && upsells.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Recommended Services</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {upsells.map((trigger) => (
                <UpsellCard
                  key={trigger.id}
                  propertyId={propertyId}
                  trigger={trigger}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Vault completed - show dashboard
  const completedPercentage = Math.round(
    (vaultStatus.uploadedDocs.length /
      (vaultStatus.uploadedDocs.length + vaultStatus.missingDocs.length)) *
      100
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Property Vault</h1>
          <p className="text-muted-foreground">
            Secure document storage for your property
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/properties/${propertyId}/vault/upload`}>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          </Link>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">Complete</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {vaultStatus.uploadedDocs.length}
              </span>
              <span className="text-muted-foreground">uploaded</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completeness
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{completedPercentage}%</span>
              <div className="flex-1 bg-muted rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full"
                  style={{ width: `${completedPercentage}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Missing Docs Alert */}
      {vaultStatus.missingDocs.length > 0 && (
        <MissingDocAlert
          propertyId={propertyId}
          missingDocs={vaultStatus.missingDocs}
        />
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Folder Tree */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileArchive className="h-5 w-5" />
              Document Folders
            </CardTitle>
            <CardDescription>
              Browse and manage your vault documents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FolderTree
              propertyId={propertyId}
              folders={vaultStatus.steps.map((step) => ({
                name: step.id.toUpperCase() as VaultFolder,
                categories: step.categories as DocumentCategory[],
              }))}
              uploadedDocs={vaultStatus.uploadedDocs}
              requiredDocs={vaultStatus.missingDocs.concat(
                vaultStatus.uploadedDocs
              )}
            />
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Upsells */}
          {upsells && upsells.length > 0 && (
            <div className="space-y-4">
              {upsells.slice(0, 2).map((trigger) => (
                <UpsellCard
                  key={trigger.id}
                  propertyId={propertyId}
                  trigger={trigger}
                />
              ))}
            </div>
          )}

          {/* Evidence Log */}
          <EvidenceLog propertyId={propertyId} limit={5} />

          {/* Security Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-green-500" />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>SOC2 compliant audit logging</li>
                <li>Encrypted document storage</li>
                <li>Role-based access control</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
