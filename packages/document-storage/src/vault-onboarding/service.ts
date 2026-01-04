/**
 * Vault Onboarding Service
 *
 * Manages the guided onboarding workflow for Property Record Vaults.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClient = any;

import type {
  InitializeVaultInput,
  UploadVaultDocumentInput,
  VaultOnboardingState,
  OnboardingStep,
  DocumentCategory,
  PropertyType,
} from './types';
import {
  VAULT_FOLDERS,
  REQUIRED_DOCS,
  DEFAULT_ONBOARDING_STEPS,
} from './types';

export class VaultOnboardingService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Initialize a new vault for a property
   */
  async initializeVault(
    input: InitializeVaultInput,
    userId: string
  ): Promise<VaultOnboardingState> {
    const { propertyId, propertyType, enabledFolders } = input;

    // Get required docs based on property type
    const requiredDocs = REQUIRED_DOCS[propertyType] || REQUIRED_DOCS.OTHER;

    // Build folder structure
    const folders = enabledFolders || (Object.keys(VAULT_FOLDERS) as (keyof typeof VAULT_FOLDERS)[]);
    const folderStructure = folders.map((folder) => ({
      name: folder,
      categories: VAULT_FOLDERS[folder],
    }));

    // Create vault
    const vault = await this.prisma.propertyVault.create({
      data: {
        propertyId,
        status: 'in_progress',
        folderStructure: folderStructure,
        requiredDocs: requiredDocs,
        uploadedDocs: [],
        onboardingStep: 0,
        onboardingConfig: {
          userId,
          startedAt: new Date().toISOString(),
          propertyType,
        },
      },
    });

    return this.buildOnboardingState(vault, requiredDocs);
  }

  /**
   * Get current vault status for a property
   */
  async getVaultStatus(
    propertyId: string,
    _userId: string
  ): Promise<VaultOnboardingState | null> {
    const vault = await this.prisma.propertyVault.findUnique({
      where: { propertyId },
      include: {
        documents: true,
      },
    });

    if (!vault) {
      return null;
    }

    return this.buildOnboardingState(vault, vault.requiredDocs as DocumentCategory[]);
  }

  /**
   * Upload a document to the vault
   */
  async uploadDocument(
    input: UploadVaultDocumentInput,
    userId: string
  ): Promise<void> {
    const { vaultId, documentId, folder, category, tags, description } = input;

    // Get the vault to check required docs
    const vault = await this.prisma.propertyVault.findUnique({
      where: { id: vaultId },
    });

    if (!vault) {
      throw new Error('Vault not found');
    }

    const requiredDocs = vault.requiredDocs as DocumentCategory[];
    const isRequired = requiredDocs.includes(category);

    // Create vault document link
    await this.prisma.vaultDocument.create({
      data: {
        vaultId,
        documentId,
        folder,
        category,
        tags: tags || [],
        description,
        isRequired,
        uploadedByUserId: userId,
      },
    });

    // Update uploaded docs list
    const uploadedDocs = vault.uploadedDocs as string[];
    if (!uploadedDocs.includes(category)) {
      await this.prisma.propertyVault.update({
        where: { id: vaultId },
        data: {
          uploadedDocs: [...uploadedDocs, category],
        },
      });
    }

    // Check if all required docs are uploaded
    const allUploaded = requiredDocs.every((doc) =>
      [...uploadedDocs, category].includes(doc)
    );

    if (allUploaded && vault.status !== 'completed') {
      // Auto-complete if all required docs are uploaded
      await this.prisma.propertyVault.update({
        where: { id: vaultId },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });
    }
  }

  /**
   * Get missing required documents for a property
   */
  async getMissingDocuments(propertyId: string): Promise<DocumentCategory[]> {
    const vault = await this.prisma.propertyVault.findUnique({
      where: { propertyId },
    });

    if (!vault) {
      return [];
    }

    const requiredDocs = vault.requiredDocs as DocumentCategory[];
    const uploadedDocs = vault.uploadedDocs as string[];

    return requiredDocs.filter((doc) => !uploadedDocs.includes(doc));
  }

  /**
   * Mark onboarding as complete
   */
  async completeOnboarding(propertyId: string, _userId: string): Promise<void> {
    await this.prisma.propertyVault.update({
      where: { propertyId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });
  }

  /**
   * Get folder structure for display
   */
  getFolderStructure(): typeof VAULT_FOLDERS {
    return VAULT_FOLDERS;
  }

  /**
   * Get required documents for a property type
   */
  getRequiredDocsForType(propertyType: PropertyType): DocumentCategory[] {
    return REQUIRED_DOCS[propertyType] || REQUIRED_DOCS.OTHER;
  }

  /**
   * Build onboarding state from vault record
   */
  private buildOnboardingState(
    vault: {
      id: string;
      propertyId: string;
      status: string;
      onboardingStep: number;
      uploadedDocs: unknown;
      completedAt: Date | null;
    },
    requiredDocs: DocumentCategory[]
  ): VaultOnboardingState {
    const uploadedDocs = (vault.uploadedDocs as string[]) || [];

    // Build steps with completion status
    const steps: OnboardingStep[] = DEFAULT_ONBOARDING_STEPS.map((step) => ({
      ...step,
      completed: step.categories.every(
        (cat) =>
          !requiredDocs.includes(cat as DocumentCategory) ||
          uploadedDocs.includes(cat)
      ),
    }));

    // Calculate missing docs
    const missingDocs = requiredDocs.filter(
      (doc) => !uploadedDocs.includes(doc)
    );

    return {
      propertyId: vault.propertyId,
      vaultId: vault.id,
      status: vault.status as 'not_started' | 'in_progress' | 'completed',
      currentStep: vault.onboardingStep,
      steps,
      missingDocs,
      uploadedDocs: uploadedDocs as DocumentCategory[],
      completedAt: vault.completedAt,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let serviceInstance: VaultOnboardingService | null = null;

export function getVaultOnboardingService(
  prisma: PrismaClient
): VaultOnboardingService {
  if (!serviceInstance) {
    serviceInstance = new VaultOnboardingService(prisma);
  }
  return serviceInstance;
}
