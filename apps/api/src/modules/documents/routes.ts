import { prisma } from '@realriches/database';
import {
  getUploadService,
  getDocumentACL,
  getTemplateEngine,
  getSignatureService,
  getStorageClient,
  type ACLContext,
  type EntityOwnership,
  type UploadRequest,
  type UserRole,
  UploadRequestSchema,
} from '@realriches/document-storage';
import { generatePrefixedId, NotFoundError, ForbiddenError, ValidationError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Schemas
// =============================================================================

const RequestSignatureSchema = z.object({
  documentId: z.string(),
  signers: z.array(z.object({
    userId: z.string(),
    email: z.string().email(),
    name: z.string(),
    role: z.enum(['landlord', 'tenant', 'agent', 'witness', 'guarantor']),
    order: z.number().optional(),
  })),
  message: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  expiresInDays: z.number().optional(),
});

const GenerateDocumentSchema = z.object({
  variables: z.record(z.union([z.string(), z.number(), z.boolean()])),
  entityType: z.enum(['property', 'unit', 'lease', 'application']),
  entityId: z.string(),
  format: z.enum(['pdf', 'docx', 'html']).default('pdf'),
});

// =============================================================================
// Helper Functions
// =============================================================================

interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  permissions: string[];
  sessionId: string;
}

function getACLContext(request: FastifyRequest): ACLContext {
  const user = request.user as AuthenticatedUser | null;
  if (!user) {
    throw new ForbiddenError('Authentication required');
  }
  return {
    userId: user.id,
    userRole: user.role,
    userEmail: user.email,
  };
}

async function getEntityOwnership(
  entityType: string | undefined,
  entityId: string | undefined,
  documentId?: string
): Promise<EntityOwnership> {
  const ownership: EntityOwnership = {};

  if (documentId) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { uploadedBy: true, ownerId: true, sharedWith: true },
    });
    if (doc) {
      ownership.documentUploaderId = doc.uploadedBy;
      ownership.documentOwnerId = doc.ownerId || undefined;
      ownership.sharedWithUserIds = (doc.sharedWith as string[]) || [];
    }
  }

  if (entityType === 'property' && entityId) {
    const property = await prisma.property.findUnique({
      where: { id: entityId },
      select: { ownerId: true, managerId: true },
    });
    if (property) {
      ownership.propertyOwnerId = property.ownerId;
      ownership.propertyManagerId = property.managerId || undefined;
    }
  }

  if (entityType === 'lease' && entityId) {
    const lease = await prisma.lease.findUnique({
      where: { id: entityId },
      select: {
        landlordId: true,
        primaryTenantId: true,
        property: { select: { ownerId: true, managerId: true } },
      },
    });
    if (lease) {
      ownership.leaseLandlordId = lease.landlordId;
      ownership.leaseTenantId = lease.primaryTenantId;
      ownership.propertyOwnerId = lease.property.ownerId;
      ownership.propertyManagerId = lease.property.managerId || undefined;
    }
  }

  if (entityType === 'application' && entityId) {
    const application = await prisma.tenantApplication.findUnique({
      where: { id: entityId },
      select: {
        applicantId: true,
        listing: { select: { property: { select: { ownerId: true } } } },
      },
    });
    if (application) {
      ownership.applicationApplicantId = application.applicantId;
      ownership.propertyOwnerId = application.listing.property.ownerId;
    }
  }

  return ownership;
}

// =============================================================================
// Routes
// =============================================================================

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  const uploadService = getUploadService();
  const acl = getDocumentACL();
  const templateEngine = getTemplateEngine();
  const signatureService = getSignatureService();
  const storage = getStorageClient();

  // ---------------------------------------------------------------------------
  // List documents
  // ---------------------------------------------------------------------------
  app.get(
    '/',
    {
      schema: {
        description: 'List documents with ACL filtering',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            entityType: { type: 'string' },
            entityId: { type: 'string' },
            type: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { entityType?: string; entityId?: string; type?: string };
      }>,
      reply: FastifyReply
    ) => {
      const context = getACLContext(request);
      const { entityType, entityId, type } = request.query;

      // Build query with ACL filtering
      const where: Record<string, unknown> = {};
      if (entityType) where.entityType = entityType;
      if (entityId) where.entityId = entityId;
      if (type) where.type = type;

      const documents = await prisma.document.findMany({
        where,
        include: {
          uploader: { select: { id: true, firstName: true, lastName: true } },
          signatures: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Filter by ACL
      const accessibleDocs = [];
      for (const doc of documents) {
        const ownership = await getEntityOwnership(doc.entityType || undefined, doc.entityId || undefined, doc.id);
        const result = acl.checkAccess(context, 'read', ownership, doc.id);
        if (result.allowed) {
          accessibleDocs.push(doc);
        }
      }

      return reply.send({ success: true, data: accessibleDocs });
    }
  );

  // ---------------------------------------------------------------------------
  // Get document by ID
  // ---------------------------------------------------------------------------
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get document details',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const context = getACLContext(request);

      const document = await prisma.document.findUnique({
        where: { id: request.params.id },
        include: {
          uploader: { select: { id: true, firstName: true, lastName: true } },
          signatures: {
            include: {
              document: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (!document) {
        throw new NotFoundError('Document not found');
      }

      // Check ACL
      const ownership = await getEntityOwnership(document.entityType || undefined, document.entityId || undefined, document.id);
      const aclResult = acl.checkAccess(context, 'read', ownership, document.id);
      if (!aclResult.allowed) {
        throw new ForbiddenError(aclResult.reason || 'Access denied');
      }

      return reply.send({ success: true, data: document });
    }
  );

  // ---------------------------------------------------------------------------
  // Get presigned upload URL
  // ---------------------------------------------------------------------------
  app.post(
    '/presigned-upload',
    {
      schema: {
        description: 'Get a presigned URL for direct upload',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const context = getACLContext(request);
      const body = request.body as {
        filename: string;
        contentType: string;
        size: number;
        metadata: UploadRequest;
      };

      // Check ACL for write access
      if (body.metadata.entityType && body.metadata.entityId) {
        const ownership = await getEntityOwnership(body.metadata.entityType, body.metadata.entityId);
        const aclResult = acl.checkAccess(context, 'write', ownership);
        if (!aclResult.allowed) {
          throw new ForbiddenError(aclResult.reason || 'Access denied');
        }
      }

      const result = await uploadService.getPresignedUploadUrl(context, {
        filename: body.filename,
        contentType: body.contentType,
        size: body.size,
        metadata: body.metadata,
      });

      return reply.send({
        success: true,
        data: {
          uploadUrl: result.uploadUrl,
          key: result.key,
          expiresAt: result.expiresAt.toISOString(),
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Complete presigned upload
  // ---------------------------------------------------------------------------
  app.post(
    '/presigned-upload/complete',
    {
      schema: {
        description: 'Complete a presigned upload and trigger virus scan',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const context = getACLContext(request);
      const { key, metadata } = request.body as { key: string; metadata: UploadRequest };

      const validated = UploadRequestSchema.parse(metadata);

      const result = await uploadService.completePresignedUpload(context, key, validated);

      // Create document record
      const document = await prisma.document.create({
        data: {
          id: result.documentId,
          name: validated.name,
          type: validated.type,
          status: result.status,
          entityType: validated.entityType,
          entityId: validated.entityId,
          filename: key.split('/').pop() || key,
          originalFilename: validated.name,
          mimeType: result.mimeType,
          size: result.size,
          extension: validated.name.split('.').pop() || '',
          storageProvider: 's3',
          bucket: result.bucket,
          key: result.key,
          sha256: result.checksum,
          uploadedBy: context.userId,
          ownerId: context.userId,
          visibility: validated.visibility || 'private',
          tags: validated.tags || [],
          description: validated.description,
        },
      });

      return reply.status(201).send({ success: true, data: document });
    }
  );

  // ---------------------------------------------------------------------------
  // Upload document (multipart)
  // ---------------------------------------------------------------------------
  app.post(
    '/',
    {
      schema: {
        description: 'Upload a document with multipart form data',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const context = getACLContext(request);

      // Handle multipart file upload
      const parts = request.parts();
      let fileBuffer: Buffer | null = null;
      let filename = '';
      let mimetype = '';
      const metadata: Record<string, unknown> = {};

      for await (const part of parts) {
        if (part.type === 'file') {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          fileBuffer = Buffer.concat(chunks);
          filename = part.filename || 'upload';
          mimetype = part.mimetype || 'application/octet-stream';
        } else {
          metadata[part.fieldname] = part.value;
        }
      }

      if (!fileBuffer) {
        throw new ValidationError('No file provided');
      }

      const validated = UploadRequestSchema.parse(metadata);

      // Check ACL
      if (validated.entityType && validated.entityId) {
        const ownership = await getEntityOwnership(validated.entityType, validated.entityId);
        const aclResult = acl.checkAccess(context, 'write', ownership);
        if (!aclResult.allowed) {
          throw new ForbiddenError(aclResult.reason || 'Access denied');
        }
      }

      const result = await uploadService.upload(context, validated, {
        buffer: fileBuffer,
        filename,
        mimetype,
      });

      // Create document record
      const document = await prisma.document.create({
        data: {
          id: result.documentId,
          name: validated.name,
          type: validated.type,
          status: result.status,
          entityType: validated.entityType,
          entityId: validated.entityId,
          filename: result.key.split('/').pop() || result.key,
          originalFilename: filename,
          mimeType: result.mimeType,
          size: result.size,
          extension: filename.split('.').pop() || '',
          storageProvider: 's3',
          bucket: result.bucket,
          key: result.key,
          sha256: result.checksum,
          uploadedBy: context.userId,
          ownerId: context.userId,
          visibility: validated.visibility || 'private',
          tags: validated.tags || [],
          description: validated.description,
        },
      });

      return reply.status(201).send({ success: true, data: document });
    }
  );

  // ---------------------------------------------------------------------------
  // Get download URL
  // ---------------------------------------------------------------------------
  app.get(
    '/:id/download',
    {
      schema: {
        description: 'Get a presigned download URL',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const context = getACLContext(request);

      const document = await prisma.document.findUnique({
        where: { id: request.params.id },
      });

      if (!document) {
        throw new NotFoundError('Document not found');
      }

      // Check ACL
      const ownership = await getEntityOwnership(document.entityType || undefined, document.entityId || undefined, document.id);
      const aclResult = acl.checkAccess(context, 'download', ownership, document.id);
      if (!aclResult.allowed) {
        throw new ForbiddenError(aclResult.reason || 'Access denied');
      }

      // Check if document is quarantined
      if (document.status === 'quarantined') {
        throw new ForbiddenError('Document is quarantined and cannot be downloaded');
      }

      const { url, expiresAt } = await uploadService.getDownloadUrl(
        context,
        document.key,
        document.originalFilename
      );

      // Update download count
      await prisma.document.update({
        where: { id: document.id },
        data: {
          downloadCount: { increment: 1 },
          lastAccessedAt: new Date(),
        },
      });

      return reply.send({
        success: true,
        data: {
          url,
          expiresAt: expiresAt.toISOString(),
          filename: document.originalFilename,
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Delete document
  // ---------------------------------------------------------------------------
  app.delete(
    '/:id',
    {
      schema: {
        description: 'Delete a document',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const context = getACLContext(request);

      const document = await prisma.document.findUnique({
        where: { id: request.params.id },
      });

      if (!document) {
        throw new NotFoundError('Document not found');
      }

      // Check ACL
      const ownership = await getEntityOwnership(document.entityType || undefined, document.entityId || undefined, document.id);
      const aclResult = acl.checkAccess(context, 'delete', ownership, document.id);
      if (!aclResult.allowed) {
        throw new ForbiddenError(aclResult.reason || 'Access denied');
      }

      // Delete from storage
      await uploadService.delete(context, document.key);

      // Soft delete in database
      await prisma.document.update({
        where: { id: document.id },
        data: { status: 'deleted' },
      });

      return reply.send({ success: true, message: 'Document deleted' });
    }
  );

  // ---------------------------------------------------------------------------
  // Request signatures
  // ---------------------------------------------------------------------------
  app.post(
    '/signatures/request',
    {
      schema: {
        description: 'Request signatures for a document',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const context = getACLContext(request);
      const data = RequestSignatureSchema.parse(request.body);

      const document = await prisma.document.findUnique({
        where: { id: data.documentId },
      });

      if (!document) {
        throw new NotFoundError('Document not found');
      }

      // Check ACL for share permission
      const ownership = await getEntityOwnership(document.entityType || undefined, document.entityId || undefined, document.id);
      const aclResult = acl.checkAccess(context, 'share', ownership, document.id);
      if (!aclResult.allowed) {
        throw new ForbiddenError(aclResult.reason || 'Access denied');
      }

      // Create signature requests
      const requests = await signatureService.createRequests({
        documentId: document.id,
        documentName: document.name,
        signers: data.signers.map(s => ({
          userId: s.userId,
          email: s.email,
          name: s.name,
          role: s.role,
          order: s.order,
        })),
        message: data.message,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        expiresInDays: data.expiresInDays,
      });

      // Create signature records in database
      for (const req of requests) {
        await prisma.documentSignature.create({
          data: {
            id: req.id,
            documentId: document.id,
            signerId: req.signerId,
            signerEmail: req.signerEmail,
            signerName: req.signerName,
            signerRole: req.signerRole,
            status: 'pending',
            order: req.order,
            expiresAt: req.expiresAt,
          },
        });
      }

      // Update document status
      await prisma.document.update({
        where: { id: document.id },
        data: { status: 'pending_signatures' },
      });

      return reply.send({ success: true, data: requests });
    }
  );

  // ---------------------------------------------------------------------------
  // Sign document
  // ---------------------------------------------------------------------------
  app.post(
    '/signatures/:id/sign',
    {
      schema: {
        description: 'Sign a document',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const context = getACLContext(request);
      const { signatureData, signatureImageUrl } = (request.body as {
        signatureData: string;
        signatureImageUrl?: string;
      }) || {};

      const signature = await prisma.documentSignature.findUnique({
        where: { id: request.params.id },
        include: { document: true },
      });

      if (!signature) {
        throw new NotFoundError('Signature request not found');
      }

      if (signature.signerId !== context.userId) {
        throw new ForbiddenError('You are not authorized to sign this document');
      }

      if (signature.status !== 'pending') {
        throw new ForbiddenError('Signature already completed or declined');
      }

      // Complete signature
      await signatureService.completeSignature({
        requestId: signature.id,
        signatureData,
        signatureImageUrl,
        ipAddress: request.ip || 'unknown',
        userAgent: request.headers['user-agent'] || 'unknown',
      });

      // Update database
      await prisma.documentSignature.update({
        where: { id: signature.id },
        data: {
          status: 'signed',
          signedAt: new Date(),
          signatureImageUrl,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      });

      // Check if all signatures are complete
      const pendingSignatures = await prisma.documentSignature.count({
        where: {
          documentId: signature.documentId,
          status: 'pending',
        },
      });

      if (pendingSignatures === 0) {
        await prisma.document.update({
          where: { id: signature.documentId },
          data: { status: 'signed' },
        });
      }

      return reply.send({ success: true, message: 'Document signed successfully' });
    }
  );

  // ---------------------------------------------------------------------------
  // Get templates
  // ---------------------------------------------------------------------------
  app.get(
    '/templates',
    {
      schema: {
        description: 'List document templates',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            marketId: { type: 'string' },
            type: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { category?: string; marketId?: string; type?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { category, marketId, type } = request.query;

      // Get system templates
      let templates = templateEngine.getSystemTemplates();

      // Filter by criteria
      if (type) {
        templates = templates.filter((t) => t.type === type);
      }
      if (marketId) {
        templates = templates.filter((t) => !t.marketId || t.marketId === marketId);
      }

      // Also get custom templates from database
      const dbWhere: Record<string, unknown> = { isActive: true };
      if (category) dbWhere.category = category;
      if (marketId) dbWhere.marketId = marketId;

      const dbTemplates = await prisma.documentTemplate.findMany({
        where: dbWhere,
        orderBy: { name: 'asc' },
      });

      // Combine and return
      const allTemplates = [
        ...templates.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.type,
          format: t.format,
          isSystem: t.isSystem,
          version: t.version,
          marketId: t.marketId,
          variables: t.variables,
        })),
        ...dbTemplates,
      ];

      return reply.send({ success: true, data: allTemplates });
    }
  );

  // ---------------------------------------------------------------------------
  // Generate document from template
  // ---------------------------------------------------------------------------
  app.post(
    '/templates/:id/generate',
    {
      schema: {
        description: 'Generate document from template',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const context = getACLContext(request);
      const data = GenerateDocumentSchema.parse(request.body);

      // Try to find system template first
      let template = templateEngine.getSystemTemplate(request.params.id);

      if (!template) {
        // Look in database
        const dbTemplate = await prisma.documentTemplate.findUnique({
          where: { id: request.params.id },
        });

        if (!dbTemplate) {
          throw new NotFoundError('Template not found');
        }

        template = {
          id: dbTemplate.id,
          name: dbTemplate.name,
          type: dbTemplate.type as 'LEASE' | 'AMENDMENT' | 'DISCLOSURE' | 'OTHER',
          format: dbTemplate.format as 'html' | 'docx',
          content: '', // Would need to fetch from storage
          variables: (dbTemplate.variables as unknown[])?.map((v) => v as import('@realriches/document-storage').TemplateVariable) ?? [],
          isSystem: dbTemplate.isSystem,
          version: dbTemplate.version,
          marketId: dbTemplate.marketId || undefined,
          createdAt: dbTemplate.createdAt,
          updatedAt: dbTemplate.updatedAt,
        };
      }

      // Check ACL
      const ownership = await getEntityOwnership(data.entityType, data.entityId);
      const aclResult = acl.checkAccess(context, 'write', ownership);
      if (!aclResult.allowed) {
        throw new ForbiddenError(aclResult.reason || 'Access denied');
      }

      // Generate document
      const prefix = `${data.entityType.toLowerCase()}/${data.entityId}/generated`;
      const { key, url, result } = await templateEngine.renderAndStore(
        template,
        {
          format: data.format,
          variables: data.variables,
        },
        prefix
      );

      // Create document record
      const document = await prisma.document.create({
        data: {
          id: generatePrefixedId('doc'),
          name: result.filename,
          type: template.type,
          status: 'active',
          entityType: data.entityType,
          entityId: data.entityId,
          filename: result.filename,
          originalFilename: result.filename,
          mimeType: result.mimeType,
          size: result.buffer.length,
          extension: data.format,
          storageProvider: 's3',
          bucket: storage.bucket,
          key,
          sha256: result.checksum,
          uploadedBy: context.userId,
          ownerId: context.userId,
          visibility: 'private',
        },
      });

      // Update template usage count
      if (!template.isSystem) {
        await prisma.documentTemplate.update({
          where: { id: template.id },
          data: { usageCount: { increment: 1 } },
        });
      }

      return reply.status(201).send({
        success: true,
        data: {
          document,
          generatedUrl: url,
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Digital vault - list user's documents
  // ---------------------------------------------------------------------------
  app.get(
    '/vault',
    {
      schema: {
        description: 'Access personal document vault',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const context = getACLContext(request);

      const documents = await prisma.document.findMany({
        where: {
          OR: [
            { uploadedBy: context.userId },
            { ownerId: context.userId },
            { signatures: { some: { signerId: context.userId } } },
            // sharedWith is a JSON array - use array_contains for PostgreSQL
            { sharedWith: { array_contains: context.userId } },
          ],
          status: { not: 'deleted' },
        },
        include: {
          signatures: {
            where: { signerId: context.userId },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ success: true, data: documents });
    }
  );

  // ---------------------------------------------------------------------------
  // Get scan queue status (admin only)
  // ---------------------------------------------------------------------------
  app.get(
    '/admin/scan-queue',
    {
      schema: {
        description: 'Get virus scan queue status',
        tags: ['Documents', 'Admin'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const context = getACLContext(request);

      if (context.userRole !== 'super_admin' && context.userRole !== 'admin') {
        throw new ForbiddenError('Admin access required');
      }

      const status = uploadService.getScanQueueStatus();
      const signatureQueueStatus = signatureService.getQueueStatus();

      return reply.send({
        success: true,
        data: {
          virusScan: status,
          signatureEmails: signatureQueueStatus,
        },
      });
    }
  );
}
