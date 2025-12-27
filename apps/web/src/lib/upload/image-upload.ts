/**
 * Image Upload Service
 * 
 * Provides S3 pre-signed URL upload functionality with:
 * - Client-side image compression
 * - Progress tracking
 * - Error handling with retry logic
 * - HEIC/HEIF to JPEG conversion support
 * 
 * @module lib/upload/image-upload
 */

import { api } from '@/lib/api';

// =============================================================================
// TYPES
// =============================================================================

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadOptions {
  maxSizeMB?: number;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  onProgress?: (progress: UploadProgress) => void;
}

export interface PreSignedUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresAt: string;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_MAX_SIZE_MB = 10;
const DEFAULT_MAX_WIDTH = 2048;
const DEFAULT_MAX_HEIGHT = 2048;
const DEFAULT_QUALITY = 0.85;
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const UPLOAD_RETRY_COUNT = 3;
const UPLOAD_RETRY_DELAY_MS = 1000;

// =============================================================================
// IMAGE COMPRESSION
// =============================================================================

/**
 * Compresses an image file to meet size and dimension constraints.
 * Uses canvas-based compression for JPEG/PNG/WebP.
 */
export async function compressImage(
  file: File,
  options: UploadOptions = {}
): Promise<File> {
  const {
    maxSizeMB = DEFAULT_MAX_SIZE_MB,
    maxWidth = DEFAULT_MAX_WIDTH,
    maxHeight = DEFAULT_MAX_HEIGHT,
    quality = DEFAULT_QUALITY,
  } = options;

  // If file is already small enough and proper format, return as-is
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB <= maxSizeMB && file.type !== 'image/heic' && file.type !== 'image/heif') {
    // Still check dimensions
    const dimensions = await getImageDimensions(file);
    if (dimensions.width <= maxWidth && dimensions.height <= maxHeight) {
      return file;
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;

      // Draw image with white background (for transparency)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            // Create new file with same name but .jpg extension
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^/.]+$/, '.jpg'),
              { type: 'image/jpeg' }
            );
            resolve(compressedFile);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for compression'));
    };

    // Create object URL for the file
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Gets the dimensions of an image file.
 */
async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      reject(new Error('Failed to load image'));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

// =============================================================================
// PRE-SIGNED URL FETCHING
// =============================================================================

/**
 * Fetches a pre-signed URL from the API for direct S3 upload.
 */
export async function getPreSignedUrl(
  listingId: string,
  filename: string,
  contentType: string
): Promise<PreSignedUrlResponse | null> {
  try {
    const response = await api.post<PreSignedUrlResponse>(
      `/listings/${listingId}/photos/presign`,
      {
        filename,
        contentType,
      }
    );

    if (response.data) {
      return response.data;
    }

    console.error('Failed to get pre-signed URL:', response.error);
    return null;
  } catch (error) {
    console.error('Error fetching pre-signed URL:', error);
    return null;
  }
}

/**
 * Fetches multiple pre-signed URLs for batch upload.
 */
export async function getPreSignedUrls(
  listingId: string,
  files: { filename: string; contentType: string }[]
): Promise<PreSignedUrlResponse[]> {
  try {
    const response = await api.post<{ urls: PreSignedUrlResponse[] }>(
      `/listings/${listingId}/photos/presign-batch`,
      { files }
    );

    if (response.data?.urls) {
      return response.data.urls;
    }

    console.error('Failed to get pre-signed URLs:', response.error);
    return [];
  } catch (error) {
    console.error('Error fetching pre-signed URLs:', error);
    return [];
  }
}

// =============================================================================
// UPLOAD TO S3
// =============================================================================

/**
 * Uploads a file directly to S3 using a pre-signed URL.
 * Includes progress tracking and retry logic.
 */
export async function uploadToS3(
  file: File,
  uploadUrl: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<boolean> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < UPLOAD_RETRY_COUNT; attempt++) {
    try {
      const result = await new Promise<boolean>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress({
              loaded: event.loaded,
              total: event.total,
              percentage: Math.round((event.loaded / event.total) * 100),
            });
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(true);
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error during upload'));
        };

        xhr.ontimeout = () => {
          reject(new Error('Upload timed out'));
        };

        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.timeout = 60000; // 60 second timeout
        xhr.send(file);
      });

      return result;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Upload attempt ${attempt + 1} failed:`, error);
      
      if (attempt < UPLOAD_RETRY_COUNT - 1) {
        // Wait before retrying with exponential backoff
        await new Promise((resolve) => setTimeout(resolve, UPLOAD_RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }

  console.error('All upload attempts failed:', lastError);
  return false;
}

// =============================================================================
// HIGH-LEVEL UPLOAD FUNCTIONS
// =============================================================================

/**
 * Uploads a single image for a listing.
 * Handles compression, pre-signed URL fetching, and S3 upload.
 */
export async function uploadListingPhoto(
  listingId: string,
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  try {
    // Validate file type
    if (!SUPPORTED_TYPES.includes(file.type)) {
      return {
        success: false,
        error: `Unsupported file type: ${file.type}. Supported types: JPEG, PNG, WebP`,
      };
    }

    // Compress image
    const compressedFile = await compressImage(file, options);

    // Get pre-signed URL
    const presignedData = await getPreSignedUrl(
      listingId,
      compressedFile.name,
      compressedFile.type
    );

    if (!presignedData) {
      return {
        success: false,
        error: 'Failed to get upload URL. Please try again.',
      };
    }

    // Upload to S3
    const uploadSuccess = await uploadToS3(
      compressedFile,
      presignedData.uploadUrl,
      options.onProgress
    );

    if (!uploadSuccess) {
      return {
        success: false,
        error: 'Upload failed. Please check your connection and try again.',
      };
    }

    // Confirm upload with backend
    const confirmResponse = await api.post<{ success: boolean }>(
      `/listings/${listingId}/photos/confirm`,
      { key: presignedData.key }
    );

    if (!confirmResponse.data?.success) {
      return {
        success: false,
        error: 'Failed to confirm upload. The image may not appear correctly.',
      };
    }

    return {
      success: true,
      url: presignedData.publicUrl,
      key: presignedData.key,
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown upload error',
    };
  }
}

/**
 * Uploads multiple images for a listing with parallel execution.
 * Limits concurrent uploads to prevent overwhelming the server.
 */
export async function uploadListingPhotos(
  listingId: string,
  files: File[],
  options: UploadOptions & {
    onFileProgress?: (index: number, progress: UploadProgress) => void;
    onFileComplete?: (index: number, result: UploadResult) => void;
    maxConcurrent?: number;
  } = {}
): Promise<UploadResult[]> {
  const { maxConcurrent = 3, onFileProgress, onFileComplete, ...uploadOptions } = options;
  const results: UploadResult[] = new Array(files.length);
  const queue = files.map((file, index) => ({ file, index }));

  const uploadNext = async (): Promise<void> => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const { file, index } = item;
      const result = await uploadListingPhoto(listingId, file, {
        ...uploadOptions,
        onProgress: (progress) => onFileProgress?.(index, progress),
      });

      results[index] = result;
      onFileComplete?.(index, result);
    }
  };

  // Start concurrent upload workers
  const workers = Array(Math.min(maxConcurrent, files.length))
    .fill(null)
    .map(() => uploadNext());

  await Promise.all(workers);

  return results;
}

/**
 * Deletes a photo from a listing.
 */
export async function deleteListingPhoto(
  listingId: string,
  photoKey: string
): Promise<boolean> {
  try {
    const response = await api.delete(`/listings/${listingId}/photos/${encodeURIComponent(photoKey)}`);
    return !response.error;
  } catch (error) {
    console.error('Failed to delete photo:', error);
    return false;
  }
}

/**
 * Reorders photos for a listing.
 */
export async function reorderListingPhotos(
  listingId: string,
  photoKeys: string[]
): Promise<boolean> {
  try {
    const response = await api.put(`/listings/${listingId}/photos/reorder`, { photoKeys });
    return !response.error;
  } catch (error) {
    console.error('Failed to reorder photos:', error);
    return false;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Validates a file before upload.
 */
export function validateImageFile(file: File, maxSizeMB: number = DEFAULT_MAX_SIZE_MB): {
  valid: boolean;
  error?: string;
} {
  if (!SUPPORTED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type. Please use JPEG, PNG, or WebP.`,
    };
  }

  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > maxSizeMB) {
    return {
      valid: false,
      error: `File too large (${sizeMB.toFixed(1)}MB). Maximum size is ${maxSizeMB}MB.`,
    };
  }

  return { valid: true };
}

/**
 * Creates a preview URL for a file.
 * Remember to revoke the URL when done to prevent memory leaks.
 */
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Revokes a preview URL to free memory.
 */
export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Formats file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
