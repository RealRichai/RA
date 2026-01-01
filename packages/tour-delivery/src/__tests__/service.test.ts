import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createMockStorageProvider, MockStorageProvider } from '../providers/mock';
import { createMockGatingService } from '../gating';
import { createMeteringService, InMemoryMeteringService } from '../metering';
import {
  TourDeliveryService,
  resetTourDeliveryService,
} from '../service';
import type { TourAccessRequest } from '../types';

describe('TourDeliveryService', () => {
  let plyStorage: MockStorageProvider;
  let sogStorage: MockStorageProvider;
  let service: TourDeliveryService;

  beforeEach(() => {
    resetTourDeliveryService();

    plyStorage = createMockStorageProvider('ply');
    sogStorage = createMockStorageProvider('sog');

    service = new TourDeliveryService({
      plyStorage,
      sogStorage,
      gatingService: createMockGatingService(['NYC', 'LA'], ['pro', 'enterprise']),
      meteringService: createMeteringService(),
      signedUrlTtl: 3600,
      enableMetering: true,
    });
  });

  afterEach(() => {
    resetTourDeliveryService();
    plyStorage.clear();
    sogStorage.clear();
  });

  describe('requestAccess', () => {
    const validRequest: TourAccessRequest = {
      tourAssetId: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      market: 'NYC',
      plan: 'pro',
    };

    it('grants access for valid request with existing asset', async () => {
      // Add SOG file
      sogStorage.addObject('tours/NYC/123e4567-e89b-12d3-a456-426614174000/output.sog', 'sog-content');

      const result = await service.requestAccess(validRequest);

      expect(result.granted).toBe(true);
      expect(result.sogUrl).toBeDefined();
      expect(result.sogUrl).toContain('sog.mock.storage');
      expect(result.expiresAt).toBeDefined();
      expect(result.sessionId).toBeDefined();
    });

    it('denies access for disabled market', async () => {
      sogStorage.addObject('tours/CHI/123e4567-e89b-12d3-a456-426614174000/output.sog', 'sog-content');

      const result = await service.requestAccess({
        ...validRequest,
        market: 'CHI', // Not enabled
      });

      expect(result.granted).toBe(false);
      expect(result.denialReason).toBe('market_not_enabled');
      expect(result.sogUrl).toBeUndefined();
    });

    it('denies access for ineligible plan', async () => {
      sogStorage.addObject('tours/NYC/123e4567-e89b-12d3-a456-426614174000/output.sog', 'sog-content');

      const result = await service.requestAccess({
        ...validRequest,
        plan: 'free', // Not eligible
      });

      expect(result.granted).toBe(false);
      expect(result.denialReason).toBe('plan_not_eligible');
      expect(result.sogUrl).toBeUndefined();
    });

    it('denies access when SOG file does not exist', async () => {
      // Don't add SOG file

      const result = await service.requestAccess(validRequest);

      expect(result.granted).toBe(false);
      expect(result.denialReason).toBe('asset_not_ready');
    });

    it('generates signed URL with correct TTL', async () => {
      sogStorage.addObject('tours/NYC/123e4567-e89b-12d3-a456-426614174000/output.sog', 'sog-content');

      const now = Date.now();
      const result = await service.requestAccess(validRequest);

      expect(result.granted).toBe(true);
      // URL should expire in approximately 1 hour
      const expectedExpiry = now + 3600 * 1000;
      expect(result.expiresAt!.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(result.expiresAt!.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000);
    });

    it('starts metering session on access', async () => {
      sogStorage.addObject('tours/NYC/123e4567-e89b-12d3-a456-426614174000/output.sog', 'sog-content');

      const result = await service.requestAccess(validRequest);

      expect(result.granted).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).toMatch(/^session_/);
    });

    it('uses provided session ID if given', async () => {
      sogStorage.addObject('tours/NYC/123e4567-e89b-12d3-a456-426614174000/output.sog', 'sog-content');

      const result = await service.requestAccess({
        ...validRequest,
        sessionId: 'existing-session-123',
      });

      expect(result.granted).toBe(true);
      expect(result.sessionId).toBe('existing-session-123');
    });
  });

  describe('No PLY access', () => {
    it('does not expose PLY storage URLs', async () => {
      const assetId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = '123e4567-e89b-12d3-a456-426614174001';

      plyStorage.addObject(`tours/NYC/${assetId}/input.ply`, 'ply-content');
      sogStorage.addObject(`tours/NYC/${assetId}/output.sog`, 'sog-content');

      const result = await service.requestAccess({
        tourAssetId: assetId,
        userId: userId,
        market: 'NYC',
        plan: 'pro',
      });

      expect(result.granted).toBe(true);
      // SOG URL is returned
      expect(result.sogUrl).toContain('sog.mock.storage');
      // PLY URL is NOT returned
      expect(result.sogUrl).not.toContain('ply.mock.storage');
      expect(result.sogUrl).not.toContain('.ply');
    });

    it('getStorageProviders returns both providers (for internal use)', () => {
      const providers = service.getStorageProviders();

      expect(providers.ply.name).toBe('ply');
      expect(providers.sog.name).toBe('sog');
    });
  });

  describe('Metering', () => {
    it('records progress correctly', async () => {
      sogStorage.addObject('tours/NYC/123e4567-e89b-12d3-a456-426614174000/output.sog', 'sog-content');

      const accessResult = await service.requestAccess({
        tourAssetId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        market: 'NYC',
        plan: 'pro',
      });

      // Record progress
      service.recordProgress(accessResult.sessionId!, 50);

      // No error thrown
      expect(true).toBe(true);
    });

    it('completes session correctly', async () => {
      sogStorage.addObject('tours/NYC/123e4567-e89b-12d3-a456-426614174000/output.sog', 'sog-content');

      const accessResult = await service.requestAccess({
        tourAssetId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        market: 'NYC',
        plan: 'pro',
      });

      // Complete session
      service.completeSession(accessResult.sessionId!);

      // No error thrown
      expect(true).toBe(true);
    });

    it('records errors correctly', async () => {
      sogStorage.addObject('tours/NYC/123e4567-e89b-12d3-a456-426614174000/output.sog', 'sog-content');

      const accessResult = await service.requestAccess({
        tourAssetId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        market: 'NYC',
        plan: 'pro',
      });

      // Record error
      service.recordError(accessResult.sessionId!, new Error('Playback failed'));

      // No error thrown
      expect(true).toBe(true);
    });
  });

  describe('Gating configuration', () => {
    it('isMarketEnabled reflects configuration', async () => {
      expect(await service.isMarketEnabled('NYC')).toBe(true);
      expect(await service.isMarketEnabled('LA')).toBe(true);
      expect(await service.isMarketEnabled('CHI')).toBe(false);
    });

    it('isPlanEligible reflects configuration', async () => {
      expect(await service.isPlanEligible('pro')).toBe(true);
      expect(await service.isPlanEligible('enterprise')).toBe(true);
      expect(await service.isPlanEligible('free')).toBe(false);
    });

    it('getGatingConfig returns current configuration', () => {
      const config = service.getGatingConfig();

      expect(config.enabledMarkets).toEqual(['NYC', 'LA']);
      expect(config.eligiblePlans).toEqual(['pro', 'enterprise']);
    });

    it('updateGatingConfig modifies configuration', async () => {
      service.updateGatingConfig({ enabledMarkets: ['SF'] });

      expect(await service.isMarketEnabled('SF')).toBe(true);
      expect(await service.isMarketEnabled('NYC')).toBe(false);
    });
  });
});

describe('Metering Service', () => {
  let meteringService: InMemoryMeteringService;

  beforeEach(() => {
    meteringService = new InMemoryMeteringService();
  });

  it('creates and tracks sessions', () => {
    const session = meteringService.startSession(
      'asset123',
      'user456',
      'NYC',
      'pro'
    );

    expect(session.id).toMatch(/^session_/);
    expect(session.tourAssetId).toBe('asset123');
    expect(session.userId).toBe('user456');
    expect(session.market).toBe('NYC');
    expect(session.plan).toBe('pro');
    expect(session.viewPercentage).toBe(0);
    expect(session.durationMs).toBe(0);
  });

  it('records progress updates', () => {
    const session = meteringService.startSession('asset123', 'user456', 'NYC', 'pro');

    const updated = meteringService.recordProgress(session.id, 50);

    expect(updated).not.toBeNull();
    expect(updated!.viewPercentage).toBe(50);
    expect(updated!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('caps view percentage at 100', () => {
    const session = meteringService.startSession('asset123', 'user456', 'NYC', 'pro');

    const updated = meteringService.recordProgress(session.id, 150);

    expect(updated!.viewPercentage).toBe(100);
  });

  it('floors view percentage at 0', () => {
    const session = meteringService.startSession('asset123', 'user456', 'NYC', 'pro');

    const updated = meteringService.recordProgress(session.id, -50);

    expect(updated!.viewPercentage).toBe(0);
  });

  it('completes sessions', () => {
    const session = meteringService.startSession('asset123', 'user456', 'NYC', 'pro');

    const completed = meteringService.completeSession(session.id);

    expect(completed).not.toBeNull();
    expect(completed!.completedAt).toBeDefined();
    expect(completed!.viewPercentage).toBe(100);
  });

  it('records events for sessions', () => {
    const session = meteringService.startSession('asset123', 'user456', 'NYC', 'pro');
    meteringService.recordProgress(session.id, 25);
    meteringService.recordProgress(session.id, 50);
    meteringService.completeSession(session.id);

    const events = meteringService.getSessionEvents(session.id);

    expect(events).toHaveLength(4);
    expect(events[0].type).toBe('view_start');
    expect(events[1].type).toBe('view_progress');
    expect(events[2].type).toBe('view_progress');
    expect(events[3].type).toBe('view_complete');
  });

  it('records errors', () => {
    const session = meteringService.startSession('asset123', 'user456', 'NYC', 'pro');

    meteringService.recordError(session.id, new Error('Test error'));

    const events = meteringService.getSessionEvents(session.id);
    const errorEvent = events.find(e => e.type === 'view_error');

    expect(errorEvent).toBeDefined();
    expect(errorEvent!.metadata?.errorCode).toBe('Error');
    expect(errorEvent!.metadata?.errorMessage).toBe('Test error');
  });
});
