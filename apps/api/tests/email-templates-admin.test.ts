/**
 * Email Template Admin API Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { emailTemplateAdminRoutes } from '../src/modules/admin/email-templates';

// Create error classes that match the actual implementation
class MockTemplateNotFoundError extends Error {
  constructor(id: string) {
    super(`Template not found: ${id}`);
    this.name = 'TemplateNotFoundError';
  }
}

class MockMissingFieldsError extends Error {
  missingFields: string[];
  constructor(id: string, fields: string[]) {
    super(`Missing required fields for template '${id}': ${fields.join(', ')}`);
    this.name = 'MissingFieldsError';
    this.missingFields = fields;
  }
}

// Mock email service templates
vi.mock('@realriches/email-service', () => {
  const templates = new Map([
    ['auth:password-reset', {
      id: 'auth:password-reset',
      description: 'Password reset email',
      requiredFields: ['resetUrl', 'userName'],
      subject: 'Reset your password',
      html: (data: Record<string, unknown>) => `<p>Hello ${data.userName}</p>`,
      text: (data: Record<string, unknown>) => `Hello ${data.userName}`,
    }],
    ['auth:email-verification', {
      id: 'auth:email-verification',
      description: 'Email verification',
      requiredFields: ['verificationUrl', 'userName'],
      subject: 'Verify your email',
      html: (data: Record<string, unknown>) => `<p>Verify ${data.userName}</p>`,
    }],
    ['lease:created', {
      id: 'lease:created',
      description: 'Lease created notification',
      requiredFields: ['leaseId', 'propertyAddress'],
      subject: 'Lease Created',
      html: (data: Record<string, unknown>) => `<p>Lease ${data.leaseId}</p>`,
    }],
    ['payment:reminder', {
      id: 'payment:reminder',
      description: 'Payment reminder',
      requiredFields: ['amount', 'dueDate'],
      subject: (data: Record<string, unknown>) => `Payment of $${data.amount} due`,
      html: (data: Record<string, unknown>) => `<p>Pay $${data.amount}</p>`,
    }],
  ]);

  // Error classes that will be exported
  class TemplateNotFoundError extends Error {
    constructor(id: string) {
      super(`Template not found: ${id}`);
      this.name = 'TemplateNotFoundError';
    }
  }

  class MissingFieldsError extends Error {
    missingFields: string[];
    constructor(id: string, fields: string[]) {
      super(`Missing required fields for template '${id}': ${fields.join(', ')}`);
      this.name = 'MissingFieldsError';
      this.missingFields = fields;
    }
  }

  return {
    registerAllTemplates: vi.fn(),
    getTemplateIds: vi.fn().mockReturnValue(Array.from(templates.keys())),
    getTemplate: vi.fn().mockImplementation((id: string) => templates.get(id)),
    renderTemplate: vi.fn().mockImplementation((id: string, data: Record<string, unknown>) => {
      const template = templates.get(id);
      if (!template) throw new TemplateNotFoundError(id);

      const missing = template.requiredFields.filter(
        (f: string) => data[f] === undefined || data[f] === null
      );
      if (missing.length > 0) throw new MissingFieldsError(id, missing);

      return {
        subject: typeof template.subject === 'function' ? template.subject(data) : template.subject,
        html: template.html(data),
        text: template.text ? template.text(data) : 'text version',
      };
    }),
    TemplateNotFoundError,
    MissingFieldsError,
  };
});

// Mock logger
vi.mock('@realriches/utils', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock admin user
const mockAdminUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'admin@example.com',
  role: 'admin',
};

describe('Email Template Admin API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    app.decorate('authenticate', async (request: { user?: typeof mockAdminUser }) => {
      request.user = mockAdminUser;
    });

    app.decorate('authorize', (_request: unknown, reply: { code: (n: number) => { send: (obj: unknown) => void } }, opts: { roles: string[] }) => {
      const request = _request as { user?: { role: string } };
      if (!opts.roles.includes(request.user?.role || '')) {
        reply.code(403).send({ success: false, error: { code: 'FORBIDDEN' } });
      }
    });

    await app.register(emailTemplateAdminRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /admin/email-templates', () => {
    it('should list all templates', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.templates.length).toBe(4);
      expect(body.data.byCategory).toBeDefined();
    });

    it('should filter by category', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/?category=auth',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.templates.every((t: { category: string }) => t.category === 'auth')).toBe(true);
    });

    it('should search templates', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/?search=password',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.templates.some((t: { id: string }) => t.id.includes('password'))).toBe(true);
    });
  });

  describe('GET /admin/email-templates/:id', () => {
    it('should return template details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth:password-reset',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('auth:password-reset');
      expect(body.data.requiredFields).toContain('resetUrl');
    });

    it('should return 404 for non-existent template', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent:template',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /admin/email-templates/render', () => {
    it('should render a template', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/render',
        payload: {
          templateId: 'auth:password-reset',
          data: {
            resetUrl: 'https://example.com/reset',
            userName: 'John',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.subject).toBeDefined();
      expect(body.data.html).toBeDefined();
      expect(body.data.text).toBeDefined();
    });

    it('should return 404 for non-existent template', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/render',
        payload: {
          templateId: 'nonexistent:template',
          data: {},
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/render',
        payload: {
          templateId: 'auth:password-reset',
          data: {
            resetUrl: 'https://example.com/reset',
            // Missing userName
          },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('MISSING_FIELDS');
    });
  });

  describe('POST /admin/email-templates/validate', () => {
    it('should validate complete data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/validate',
        payload: {
          templateId: 'auth:password-reset',
          data: {
            resetUrl: 'https://example.com/reset',
            userName: 'John',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.valid).toBe(true);
      expect(body.data.missingFields).toHaveLength(0);
    });

    it('should identify missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/validate',
        payload: {
          templateId: 'auth:password-reset',
          data: {
            resetUrl: 'https://example.com/reset',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.valid).toBe(false);
      expect(body.data.missingFields).toContain('userName');
    });
  });

  describe('GET /admin/email-templates/categories', () => {
    it('should return template categories', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/categories',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.categories.length).toBeGreaterThan(0);
    });
  });

  describe('GET /admin/email-templates/stats', () => {
    it('should return template statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.total).toBe(4);
      expect(body.data.byCategory).toBeDefined();
    });
  });
});
