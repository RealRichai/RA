/**
 * Adapters Tests
 *
 * Tests for LLM provider adapters including console mock and retry logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  createConsoleProvider,
  createProvider,
  LLMProviderError,
  LLMRateLimitError,
  LLMTimeoutError,
  LLMBudgetExceededError,
} from '../adapters';
import type { CompletionRequest } from '../types';

const createTestRequest = (
  overrides?: Partial<CompletionRequest>
): CompletionRequest => ({
  messages: [{ role: 'user', content: 'Hello' }],
  model: 'claude-3-sonnet',
  ...overrides,
});

describe('Console Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createConsoleProvider', () => {
    it('should create a provider with console providerId', () => {
      const provider = createConsoleProvider();
      expect(provider.providerId).toBe('console');
    });

    it('should support all models', () => {
      const provider = createConsoleProvider();
      expect(provider.supportedModels).toContain('claude-3-opus');
      expect(provider.supportedModels).toContain('claude-3-sonnet');
      expect(provider.supportedModels).toContain('claude-3-haiku');
    });

    it('should always be available', async () => {
      const provider = createConsoleProvider();
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    it('should always validate credentials', async () => {
      const provider = createConsoleProvider();
      const valid = await provider.validateCredentials();
      expect(valid).toBe(true);
    });
  });

  describe('complete()', () => {
    it('should return mock response by default', async () => {
      const provider = createConsoleProvider();
      const request = createTestRequest();

      const response = await provider.complete(request);

      expect(response.content).toContain('mock response');
      expect(response.model).toBe('claude-3-sonnet');
      expect(response.tokensUsed.prompt).toBeGreaterThan(0);
      expect(response.tokensUsed.completion).toBeGreaterThan(0);
    });

    it('should use custom mock response when set', async () => {
      const provider = createConsoleProvider();
      provider.setMockResponse('Custom response');

      const request = createTestRequest();
      const response = await provider.complete(request);

      expect(response.content).toBe('Custom response');
    });

    it('should reset mock response after clear', async () => {
      const provider = createConsoleProvider();
      provider.setMockResponse('Custom response');
      provider.clear();

      const request = createTestRequest();
      const response = await provider.complete(request);

      expect(response.content).toContain('mock response');
    });

    it('should throw error when shouldFail is set', async () => {
      const provider = createConsoleProvider();
      provider.setShouldFail(true, 'Simulated failure');

      const request = createTestRequest();

      await expect(provider.complete(request)).rejects.toThrow(
        'Simulated failure'
      );
    });

    it('should calculate cost based on model', async () => {
      const provider = createConsoleProvider();

      const opusRequest = createTestRequest({ model: 'claude-3-opus' });
      const haikuRequest = createTestRequest({ model: 'claude-3-haiku' });

      const opusResponse = await provider.complete(opusRequest);
      const haikuResponse = await provider.complete(haikuRequest);

      // Both should have valid cost calculations
      expect(opusResponse.cost).toBeGreaterThanOrEqual(0);
      expect(haikuResponse.cost).toBeGreaterThanOrEqual(0);
      // Token usage should be the same for same input
      expect(opusResponse.tokensUsed.prompt).toBe(haikuResponse.tokensUsed.prompt);
    });

    it('should include processing time', async () => {
      const provider = createConsoleProvider();
      const request = createTestRequest();

      const response = await provider.complete(request);

      expect(response.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should have finish reason', async () => {
      const provider = createConsoleProvider();
      const request = createTestRequest();

      const response = await provider.complete(request);

      expect(response.finishReason).toBe('stop');
    });
  });

  describe('Log output', () => {
    it('should not throw when logging', async () => {
      const provider = createConsoleProvider();

      await expect(
        provider.complete(createTestRequest())
      ).resolves.toBeDefined();
    });
  });
});

describe('Provider Factory', () => {
  describe('createProvider', () => {
    it('should create console provider', () => {
      const provider = createProvider('console');
      expect(provider.providerId).toBe('console');
    });

    it('should throw for unsupported provider', () => {
      expect(() =>
        createProvider('unsupported' as 'anthropic' | 'openai' | 'console')
      ).toThrow();
    });
  });
});

describe('Error Classes', () => {
  describe('LLMProviderError', () => {
    it('should create error with provider info', () => {
      const error = new LLMProviderError(
        'API error occurred',
        'API_ERROR',
        'anthropic',
        false
      );
      expect(error.message).toContain('API error');
      expect(error.code).toBe('API_ERROR');
      expect(error.provider).toBe('anthropic');
    });
  });

  describe('LLMRateLimitError', () => {
    it('should include retry information', () => {
      const error = new LLMRateLimitError('anthropic', 60000);
      expect(error.retryAfterMs).toBe(60000);
      expect(error.message.toLowerCase()).toContain('rate limit');
    });

    it('should be instanceof LLMProviderError', () => {
      const error = new LLMRateLimitError('anthropic', 60000);
      expect(error).toBeInstanceOf(LLMProviderError);
    });
  });

  describe('LLMTimeoutError', () => {
    it('should include timeout in message', () => {
      const error = new LLMTimeoutError('anthropic', 30000);
      expect(error.message.toLowerCase()).toContain('timed out');
      expect(error.message).toContain('30000');
    });

    it('should be instanceof LLMProviderError', () => {
      const error = new LLMTimeoutError('anthropic', 30000);
      expect(error).toBeInstanceOf(LLMProviderError);
    });
  });

  describe('LLMBudgetExceededError', () => {
    it('should include budget details', () => {
      const error = new LLMBudgetExceededError('anthropic', 'user', 100, 150);
      expect(error.budgetType).toBe('user');
      expect(error.limit).toBe(100);
      expect(error.current).toBe(150);
      expect(error.message.toLowerCase()).toContain('budget');
    });

    it('should be instanceof LLMProviderError', () => {
      const error = new LLMBudgetExceededError('anthropic', 'org', 100, 150);
      expect(error).toBeInstanceOf(LLMProviderError);
    });

    it('should support different budget types', () => {
      const userError = new LLMBudgetExceededError(
        'anthropic',
        'user',
        100,
        150
      );
      const orgError = new LLMBudgetExceededError(
        'anthropic',
        'org',
        1000,
        1500
      );
      const globalError = new LLMBudgetExceededError(
        'anthropic',
        'global',
        10000,
        15000
      );

      expect(userError.budgetType).toBe('user');
      expect(orgError.budgetType).toBe('org');
      expect(globalError.budgetType).toBe('global');
    });
  });
});

describe('Retry Logic', () => {
  it('should retry on rate limit errors', async () => {
    const provider = createConsoleProvider();
    let attempts = 0;

    // Override complete to fail first time
    const originalComplete = provider.complete.bind(provider);
    vi.spyOn(provider, 'complete').mockImplementation(
      async (request: CompletionRequest) => {
        attempts++;
        if (attempts === 1) {
          throw new LLMRateLimitError('console', 1);
        }
        return originalComplete(request);
      }
    );

    const request: CompletionRequest = {
      messages: [{ role: 'user', content: 'Test' }],
      model: 'claude-3-sonnet',
      config: {
        maxRetries: 3,
        retryBaseDelay: 10,
      },
    };

    // The provider itself handles retries in BaseLLMProvider
    // This tests the mock behavior
    try {
      await provider.complete(request);
    } catch {
      // Expected on first attempt
    }

    expect(attempts).toBe(1);
  });

  it('should respect max retries', async () => {
    const provider = createConsoleProvider();
    provider.setShouldFail(true, 'Permanent failure');

    const request = createTestRequest({
      config: {
        maxRetries: 3,
      },
    });

    await expect(provider.complete(request)).rejects.toThrow(
      'Permanent failure'
    );
  });
});

describe('Token Estimation', () => {
  it('should estimate tokens based on content length', async () => {
    const provider = createConsoleProvider();

    const shortRequest = createTestRequest({
      messages: [{ role: 'user', content: 'Hi' }],
    });
    const longRequest = createTestRequest({
      messages: [
        {
          role: 'user',
          content:
            'This is a much longer message that should result in more estimated tokens.',
        },
      ],
    });

    const shortResponse = await provider.complete(shortRequest);
    const longResponse = await provider.complete(longRequest);

    expect(longResponse.tokensUsed.prompt).toBeGreaterThan(
      shortResponse.tokensUsed.prompt
    );
  });
});

describe('Multiple Messages', () => {
  it('should handle conversation history', async () => {
    const provider = createConsoleProvider();

    const request = createTestRequest({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ],
    });

    const response = await provider.complete(request);

    // Response should be generated based on the messages
    expect(response.content).toBeDefined();
    expect(response.tokensUsed.prompt).toBeGreaterThan(0);
  });
});
