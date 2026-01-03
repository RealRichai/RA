/**
 * Tour Demo Page Tests
 *
 * Tests for the 3DGS tour demo page, including:
 * - No placeholder/external URLs in the demo configuration
 * - Local asset references
 */

import * as fs from 'fs';
import * as path from 'path';

import { describe, it, expect } from 'vitest';

const TOUR_DEMO_PAGE_PATH = path.join(
  __dirname,
  '../app/[locale]/debug/tour-demo/page.tsx'
);

describe('Tour Demo Page', () => {
  describe('No Placeholder URLs', () => {
    it('should not contain external placeholder URLs', () => {
      const content = fs.readFileSync(TOUR_DEMO_PAGE_PATH, 'utf-8');

      // Check for common placeholder URL patterns
      const placeholderPatterns = [
        /https?:\/\/.*r2\.cloudflarestorage\.com/gi,
        /https?:\/\/.*placeholder/gi,
        /https?:\/\/example\.com/gi,
        /https?:\/\/.*-demo\.(com|io|dev)/gi,
      ];

      for (const pattern of placeholderPatterns) {
        const matches = content.match(pattern);
        expect(matches).toBeNull();
      }
    });

    it('should use local demo asset paths', () => {
      const content = fs.readFileSync(TOUR_DEMO_PAGE_PATH, 'utf-8');

      // Verify local paths are used
      expect(content).toContain('/demo/sog/');
      expect(content).toContain('apartment-1.ply');
      expect(content).toContain('house-1.ply');
    });

    it('should reference the DEMO_SOG_TOURS constant for local assets', () => {
      const content = fs.readFileSync(TOUR_DEMO_PAGE_PATH, 'utf-8');

      // Should define DEMO_SOG_TOURS (not DEMO_SOG_URLS with external links)
      expect(content).toContain('DEMO_SOG_TOURS');
    });
  });

  describe('Graceful Fallback', () => {
    it('should have asset availability checking', () => {
      const content = fs.readFileSync(TOUR_DEMO_PAGE_PATH, 'utf-8');

      // Should check asset availability
      expect(content).toContain('assetsChecked');
      expect(content).toContain("status === 'available'");
    });

    it('should display message when assets are unavailable', () => {
      const content = fs.readFileSync(TOUR_DEMO_PAGE_PATH, 'utf-8');

      // Should have fallback UI for missing assets
      expect(content).toContain('noAssetsMessage');
      expect(content).toContain('Demo Assets Not Found');
      expect(content).toContain('pnpm generate:demo-assets');
    });
  });

  describe('Local Asset Files', () => {
    const DEMO_SOG_DIR = path.join(
      __dirname,
      '../../public/demo/sog'
    );

    it('should have manifest.json', () => {
      const manifestPath = path.join(DEMO_SOG_DIR, 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.tours).toBeInstanceOf(Array);
      expect(manifest.tours.length).toBeGreaterThan(0);
    });

    it('should have apartment-1.ply placeholder', () => {
      const plyPath = path.join(DEMO_SOG_DIR, 'apartment-1.ply');
      expect(fs.existsSync(plyPath)).toBe(true);

      const content = fs.readFileSync(plyPath, 'utf-8');
      expect(content).toContain('ply');
      expect(content).toContain('format ascii');
    });

    it('should have house-1.ply placeholder', () => {
      const plyPath = path.join(DEMO_SOG_DIR, 'house-1.ply');
      expect(fs.existsSync(plyPath)).toBe(true);

      const content = fs.readFileSync(plyPath, 'utf-8');
      expect(content).toContain('ply');
      expect(content).toContain('format ascii');
    });
  });
});
