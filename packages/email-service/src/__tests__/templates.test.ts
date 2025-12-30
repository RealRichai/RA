import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  registerTemplate,
  renderTemplate,
  getTemplate,
  getTemplateIds,
  registerAllTemplates,
  clearTemplates,
  TemplateNotFoundError,
  MissingFieldsError,
} from '../templates';
import type { EmailTemplate } from '../types';

describe('Template Engine', () => {
  beforeAll(() => {
    clearTemplates();
  });

  afterAll(() => {
    clearTemplates();
  });

  describe('registerTemplate', () => {
    it('should register a template', () => {
      const template: EmailTemplate<{ name: string }> = {
        id: 'test.template',
        name: 'Test Template',
        description: 'A test template',
        subject: 'Hello {{name}}',
        requiredFields: ['name'],
        defaultPriority: 'normal',
        html: (data) => `<h1>Hello ${data.name}</h1>`,
      };

      registerTemplate(template);

      const retrieved = getTemplate('test.template');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test.template');
    });
  });

  describe('renderTemplate', () => {
    it('should render a template with data', () => {
      const template: EmailTemplate<{ userName: string }> = {
        id: 'test.render',
        name: 'Render Test',
        description: 'Test rendering',
        subject: (data) => `Welcome ${data.userName}`,
        requiredFields: ['userName'],
        defaultPriority: 'normal',
        html: (data) => `<p>Welcome, ${data.userName}!</p>`,
        text: (data) => `Welcome, ${data.userName}!`,
      };

      registerTemplate(template);

      const result = renderTemplate('test.render', { userName: 'John' });

      expect(result.subject).toBe('Welcome John');
      expect(result.html).toBe('<p>Welcome, John!</p>');
      expect(result.text).toBe('Welcome, John!');
    });

    it('should throw TemplateNotFoundError for unknown template', () => {
      expect(() => renderTemplate('unknown.template', {})).toThrow(
        TemplateNotFoundError
      );
    });

    it('should throw MissingFieldsError for missing required fields', () => {
      const template: EmailTemplate<{ required: string }> = {
        id: 'test.required',
        name: 'Required Test',
        description: 'Test required fields',
        subject: 'Test',
        requiredFields: ['required'],
        defaultPriority: 'normal',
        html: (data) => `<p>${data.required}</p>`,
      };

      registerTemplate(template);

      expect(() => renderTemplate('test.required', {})).toThrow(
        MissingFieldsError
      );
    });

    it('should generate text from HTML when text function is not provided', () => {
      const template: EmailTemplate<{ content: string }> = {
        id: 'test.auto-text',
        name: 'Auto Text Test',
        description: 'Test auto text generation',
        subject: 'Test',
        requiredFields: ['content'],
        defaultPriority: 'normal',
        html: (data) => `<p>${data.content}</p>`,
      };

      registerTemplate(template);

      const result = renderTemplate('test.auto-text', { content: 'Hello World' });

      expect(result.text).toContain('Hello World');
    });
  });

  describe('getTemplateIds', () => {
    it('should return all registered template IDs', () => {
      const ids = getTemplateIds();
      expect(ids).toContain('test.template');
      expect(ids).toContain('test.render');
    });
  });

  describe('registerAllTemplates', () => {
    it('should register all built-in templates', () => {
      clearTemplates();
      registerAllTemplates();

      const ids = getTemplateIds();
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toContain('auth.password-reset');
      expect(ids).toContain('auth.email-verification');
      expect(ids).toContain('auth.welcome');
    });
  });
});

describe('Built-in Templates', () => {
  beforeAll(() => {
    clearTemplates();
    registerAllTemplates();
  });

  describe('Password Reset Template', () => {
    it('should render password reset email', () => {
      const result = renderTemplate('auth.password-reset', {
        firstName: 'John',
        resetUrl: 'https://example.com/reset?token=abc123',
        expiresIn: '1 hour',
      });

      expect(result.subject).toContain('Reset');
      expect(result.html).toContain('John');
      expect(result.html).toContain('https://example.com/reset?token=abc123');
      expect(result.text).toContain('John');
    });
  });

  describe('Email Verification Template', () => {
    it('should render email verification email', () => {
      const result = renderTemplate('auth.email-verification', {
        firstName: 'Jane',
        verificationUrl: 'https://example.com/verify?token=xyz789',
        expiresIn: '24 hours',
      });

      expect(result.subject).toContain('Verify');
      expect(result.html).toContain('Jane');
      expect(result.html).toContain('https://example.com/verify?token=xyz789');
    });
  });

  describe('Welcome Template', () => {
    it('should render welcome email', () => {
      const result = renderTemplate('auth.welcome', {
        firstName: 'Mike',
        dashboardUrl: 'https://example.com/dashboard',
        userType: 'landlord',
      });

      expect(result.subject).toContain('Welcome');
      expect(result.html).toContain('Mike');
      expect(result.html).toContain('https://example.com/dashboard');
    });
  });

  describe('Lease Created Template', () => {
    it('should render lease created email', () => {
      const result = renderTemplate('lease.created', {
        tenantFirstName: 'Alice',
        propertyAddress: '123 Main St',
        leaseStartDate: 'January 1, 2024',
        leaseEndDate: 'December 31, 2024',
        monthlyRent: '$2,500',
        leaseUrl: 'https://example.com/lease/123',
        landlordName: 'Bob Smith',
      });

      expect(result.html).toContain('Alice');
      expect(result.html).toContain('123 Main St');
      expect(result.html).toContain('Bob Smith');
      expect(result.html).toContain('2,500');
    });
  });
});
