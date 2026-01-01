import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

/**
 * Compute SHA256 checksum of a file
 */
export async function computeFileChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Compute SHA256 checksum of a buffer
 */
export function computeBufferChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  const stats = await stat(filePath);
  return stats.size;
}

/**
 * Compute checksum and size for a file
 */
export async function computeFileMetadata(filePath: string): Promise<{
  checksum: string;
  sizeBytes: number;
}> {
  const [checksum, sizeBytes] = await Promise.all([
    computeFileChecksum(filePath),
    getFileSize(filePath),
  ]);
  return { checksum, sizeBytes };
}

/**
 * Verify file checksum matches expected value
 */
export async function verifyChecksum(
  filePath: string,
  expectedChecksum: string
): Promise<boolean> {
  const actualChecksum = await computeFileChecksum(filePath);
  return actualChecksum === expectedChecksum;
}
