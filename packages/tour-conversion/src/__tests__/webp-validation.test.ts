import sharp from 'sharp';
import { describe, it, expect } from 'vitest';

import {
  validateWebP,
  enforceLosslessWebP,
  convertToLosslessWebP,
} from '../webp-validation';

describe('WebP Validation', () => {
  describe('validateWebP', () => {
    it('validates lossless WebP', async () => {
      const losslessWebP = await sharp({
        create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).webp({ lossless: true }).toBuffer();

      const result = await validateWebP(losslessWebP);

      expect(result.isValid).toBe(true);
      expect(result.isWebP).toBe(true);
      expect(result.isLossless).toBe(true);
      expect(result.compressionType).toBe('lossless');
      expect(result.width).toBe(10);
      expect(result.height).toBe(10);
    });

    it('validates lossy WebP', async () => {
      const lossyWebP = await sharp({
        create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).webp({ lossless: false, quality: 80 }).toBuffer();

      const result = await validateWebP(lossyWebP);

      expect(result.isValid).toBe(true);
      expect(result.isWebP).toBe(true);
      expect(result.isLossless).toBe(false);
      expect(result.compressionType).toBe('lossy');
    });

    it('rejects non-WebP buffer', async () => {
      const pngBuffer = await sharp({
        create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).png().toBuffer();

      const result = await validateWebP(pngBuffer);

      expect(result.isValid).toBe(false);
      expect(result.isWebP).toBe(false);
    });

    it('rejects too-small buffer', async () => {
      const smallBuffer = Buffer.from([0x00, 0x01, 0x02]);

      const result = await validateWebP(smallBuffer);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too small');
    });
  });

  describe('enforceLosslessWebP', () => {
    it('passes for lossless WebP', async () => {
      const losslessWebP = await sharp({
        create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).webp({ lossless: true }).toBuffer();

      await expect(enforceLosslessWebP(losslessWebP)).resolves.not.toThrow();
    });

    it('throws for lossy WebP', async () => {
      const lossyWebP = await sharp({
        create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).webp({ lossless: false, quality: 80 }).toBuffer();

      await expect(enforceLosslessWebP(lossyWebP)).rejects.toThrow('must be lossless');
    });

    it('throws for non-WebP', async () => {
      const pngBuffer = await sharp({
        create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).png().toBuffer();

      await expect(enforceLosslessWebP(pngBuffer)).rejects.toThrow();
    });
  });

  describe('convertToLosslessWebP', () => {
    it('converts PNG to lossless WebP', async () => {
      const pngBuffer = await sharp({
        create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).png().toBuffer();

      const webpBuffer = await convertToLosslessWebP(pngBuffer);
      const result = await validateWebP(webpBuffer);

      expect(result.isValid).toBe(true);
      expect(result.isLossless).toBe(true);
    });

    it('converts JPEG to lossless WebP', async () => {
      const jpegBuffer = await sharp({
        create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).jpeg().toBuffer();

      const webpBuffer = await convertToLosslessWebP(jpegBuffer);
      const result = await validateWebP(webpBuffer);

      expect(result.isValid).toBe(true);
      expect(result.isLossless).toBe(true);
    });
  });
});
