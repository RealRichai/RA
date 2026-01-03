/**
 * Image Generator Tests
 *
 * Tests for social crop generation functionality.
 */

import { describe, it, expect } from 'vitest';
import { ImageGenerator } from '../generators/image-generator';
import { SocialCropDimensions, SocialCropFormat } from '../types';

describe('ImageGenerator', () => {
  const generator = new ImageGenerator();

  describe('Social Crop Dimensions', () => {
    it('should have correct Instagram Square dimensions', () => {
      expect(SocialCropDimensions.instagram_square).toEqual({
        width: 1080,
        height: 1080,
      });
    });

    it('should have correct Instagram Story dimensions', () => {
      expect(SocialCropDimensions.instagram_story).toEqual({
        width: 1080,
        height: 1920,
      });
    });

    it('should have correct Facebook Post dimensions', () => {
      expect(SocialCropDimensions.facebook_post).toEqual({
        width: 1200,
        height: 630,
      });
    });

    it('should have correct Twitter Post dimensions', () => {
      expect(SocialCropDimensions.twitter_post).toEqual({
        width: 1200,
        height: 675,
      });
    });

    it('should have correct LinkedIn Post dimensions', () => {
      expect(SocialCropDimensions.linkedin_post).toEqual({
        width: 1200,
        height: 627,
      });
    });

    it('should have correct Pinterest Pin dimensions', () => {
      expect(SocialCropDimensions.pinterest_pin).toEqual({
        width: 1000,
        height: 1500,
      });
    });

    it('should have correct TikTok Video dimensions', () => {
      expect(SocialCropDimensions.tiktok_video).toEqual({
        width: 1080,
        height: 1920,
      });
    });
  });

  describe('Format Validation', () => {
    it('should recognize all valid social crop formats', () => {
      const validFormats = [
        'instagram_square',
        'instagram_story',
        'facebook_post',
        'twitter_post',
        'linkedin_post',
        'pinterest_pin',
        'tiktok_video',
      ];

      for (const format of validFormats) {
        expect(Object.keys(SocialCropDimensions)).toContain(format);
      }
    });

    it('should have exactly 7 social crop formats', () => {
      expect(Object.keys(SocialCropDimensions)).toHaveLength(7);
    });
  });

  describe('Aspect Ratio Calculations', () => {
    it('should have 1:1 aspect ratio for Instagram Square', () => {
      const dims = SocialCropDimensions.instagram_square;
      expect(dims.width / dims.height).toBe(1);
    });

    it('should have 9:16 aspect ratio for Instagram Story', () => {
      const dims = SocialCropDimensions.instagram_story;
      const ratio = dims.width / dims.height;
      expect(ratio).toBeCloseTo(9 / 16, 2);
    });

    it('should have approximately 1.91:1 aspect ratio for Facebook Post', () => {
      const dims = SocialCropDimensions.facebook_post;
      const ratio = dims.width / dims.height;
      expect(ratio).toBeCloseTo(1.91, 1);
    });

    it('should have 2:3 aspect ratio for Pinterest Pin', () => {
      const dims = SocialCropDimensions.pinterest_pin;
      const ratio = dims.width / dims.height;
      expect(ratio).toBeCloseTo(2 / 3, 2);
    });
  });

  describe('Dimension Validation', () => {
    it('should have minimum width of 1000px for all formats', () => {
      for (const [format, dims] of Object.entries(SocialCropDimensions)) {
        expect(dims.width).toBeGreaterThanOrEqual(1000);
      }
    });

    it('should have minimum height of 600px for all formats', () => {
      for (const [format, dims] of Object.entries(SocialCropDimensions)) {
        expect(dims.height).toBeGreaterThanOrEqual(600);
      }
    });
  });

  describe('SocialCropFormat enum', () => {
    it('should have INSTAGRAM_SQUARE', () => {
      expect(SocialCropFormat.INSTAGRAM_SQUARE).toBe('instagram_square');
    });

    it('should have INSTAGRAM_STORY', () => {
      expect(SocialCropFormat.INSTAGRAM_STORY).toBe('instagram_story');
    });

    it('should have FACEBOOK_POST', () => {
      expect(SocialCropFormat.FACEBOOK_POST).toBe('facebook_post');
    });

    it('should have TWITTER_POST', () => {
      expect(SocialCropFormat.TWITTER_POST).toBe('twitter_post');
    });

    it('should have LINKEDIN_POST', () => {
      expect(SocialCropFormat.LINKEDIN_POST).toBe('linkedin_post');
    });

    it('should have PINTEREST_PIN', () => {
      expect(SocialCropFormat.PINTEREST_PIN).toBe('pinterest_pin');
    });

    it('should have TIKTOK_VIDEO', () => {
      expect(SocialCropFormat.TIKTOK_VIDEO).toBe('tiktok_video');
    });
  });
});
