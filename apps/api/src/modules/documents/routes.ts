import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@realriches/database';
import { generateId, NotFoundError, ForbiddenError } from '@realriches/utils';

const UploadDocumentSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['LEASE', 'AMENDMENT', 'DISCLOSURE', 'ID', 'INCOME', 'OTHER']),
  entityType: z.enum(['PROPERTY', 'UNIT', 'LEASE', 'APPLICATION']),
  entityId: z.string(),
  description: z.string().optional(),
  requiresSignature: z.boolean().default(false),
});

const RequestSignatureSchema = z.object({
  documentId: z.string(),
  signerIds: z.array(z.string()),
  message: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  // List documents
  app.get(
    '/',
    {
      schema: {
        description: 'List documents',
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
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { entityType, entityId, type } = request.query;

      const where: Record<string, unknown> = {};
      if (entityType) where.entityType = entityType;
      if (entityId) where.entityId = entityId;
      if (type) where.type = type;

      // Access control based on role
      // TODO: Implement proper access control based on entity ownership

      const documents = await prisma.document.findMany({
        where,
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          signatures: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ success: true, data: documents });
    }
  );

  // Get document by ID
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
      const document = await prisma.document.findUnique({
        where: { id: request.params.id },
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          signatures: {
            include: {
              signer: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
        },
      });

      if (!document) {
        throw new NotFoundError('Document not found');
      }

      return reply.send({ success: true, data: document });
    }
  );

  // Upload document
  app.post(
    '/',
    {
      schema: {
        description: 'Upload a document',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      // Handle multipart file upload
      const parts = request.parts();
      let fileUrl = '';
      let metadata: Record<string, unknown> = {};

      for await (const part of parts) {
        if (part.type === 'file') {
          // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Upload to S3/MinIO
          // const result = await uploadToS3(part.file, part.filename);
          // fileUrl = result.url;
          fileUrl = `https://storage.example.com/documents/${generateId('doc')}-${part.filename}`;
        } else {
          metadata[part.fieldname] = part.value;
        }
      }

      const data = UploadDocumentSchema.parse(metadata);

      const document = await prisma.document.create({
        data: {
          id: generateId('doc'),
          ...data,
          fileUrl,
          uploadedById: request.user.id,
          status: data.requiresSignature ? 'PENDING_SIGNATURE' : 'ACTIVE',
        },
      });

      return reply.status(201).send({ success: true, data: document });
    }
  );

  // Request signature
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
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = RequestSignatureSchema.parse(request.body);

      const document = await prisma.document.findUnique({
        where: { id: data.documentId },
      });

      if (!document) {
        throw new NotFoundError('Document not found');
      }

      // Create signature requests
      const signatures = await Promise.all(
        data.signerIds.map((signerId) =>
          prisma.documentSignature.create({
            data: {
              id: generateId('sig'),
              documentId: document.id,
              signerId,
              status: 'PENDING',
              requestedAt: new Date(),
              dueDate: data.dueDate ? new Date(data.dueDate) : null,
            },
          })
        )
      );

      // Update document status
      await prisma.document.update({
        where: { id: document.id },
        data: { status: 'PENDING_SIGNATURE' },
      });

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Send signature request emails

      return reply.send({ success: true, data: signatures });
    }
  );

  // Sign document
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
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { signatureData, ipAddress } = (request.body as {
        signatureData: string;
        ipAddress?: string;
      }) || {};

      const signature = await prisma.documentSignature.findUnique({
        where: { id: request.params.id },
        include: { document: true },
      });

      if (!signature) {
        throw new NotFoundError('Signature request not found');
      }

      if (signature.signerId !== request.user.id) {
        throw new ForbiddenError('Access denied');
      }

      if (signature.status !== 'PENDING') {
        throw new ForbiddenError('Signature already completed or declined');
      }

      // Update signature
      const updated = await prisma.documentSignature.update({
        where: { id: signature.id },
        data: {
          status: 'SIGNED',
          signedAt: new Date(),
          signatureData,
          ipAddress: ipAddress || request.ip,
        },
      });

      // Check if all signatures are complete
      const pendingSignatures = await prisma.documentSignature.count({
        where: {
          documentId: signature.documentId,
          status: 'PENDING',
        },
      });

      if (pendingSignatures === 0) {
        await prisma.document.update({
          where: { id: signature.documentId },
          data: { status: 'SIGNED' },
        });
      }

      return reply.send({ success: true, data: updated });
    }
  );

  // Get document templates
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
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { category?: string; marketId?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { category, marketId } = request.query;

      const where: Record<string, unknown> = { isActive: true };
      if (category) where.category = category;
      if (marketId) where.marketId = marketId;

      const templates = await prisma.documentTemplate.findMany({
        where,
        orderBy: { name: 'asc' },
      });

      return reply.send({ success: true, data: templates });
    }
  );

  // Generate document from template
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
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { variables, entityType, entityId } = (request.body as {
        variables: Record<string, string>;
        entityType: string;
        entityId: string;
      }) || {};

      const template = await prisma.documentTemplate.findUnique({
        where: { id: request.params.id },
      });

      if (!template) {
        throw new NotFoundError('Template not found');
      }

      // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Generate document from template
      // Replace variables in template content
      // Convert to PDF
      // Upload to storage

      const document = await prisma.document.create({
        data: {
          id: generateId('doc'),
          name: `${template.name} - Generated`,
          type: template.category as 'LEASE' | 'AMENDMENT' | 'DISCLOSURE' | 'ID' | 'INCOME' | 'OTHER',
          entityType,
          entityId,
          fileUrl: `https://storage.example.com/documents/${generateId('doc')}.pdf`,
          uploadedById: request.user.id,
          status: 'ACTIVE',
          templateId: template.id,
        },
      });

      return reply.status(201).send({ success: true, data: document });
    }
  );

  // Digital vault - list user's documents
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
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const documents = await prisma.document.findMany({
        where: {
          OR: [
            { uploadedById: request.user.id },
            { signatures: { some: { signerId: request.user.id } } },
          ],
        },
        include: {
          signatures: {
            where: { signerId: request.user.id },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ success: true, data: documents });
    }
  );
}
