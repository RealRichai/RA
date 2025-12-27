'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2, AlertCircle, CheckCircle, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  validateImageFile,
  createPreviewUrl,
  revokePreviewUrl,
  formatFileSize,
  type UploadProgress,
} from '@/lib/upload';

// =============================================================================
// TYPES
// =============================================================================

export interface ImageFile {
  id: string;
  file?: File;
  preview: string;
  url?: string;
  key?: string;
  isExisting: boolean;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export interface ImageUploaderProps {
  images: ImageFile[];
  onChange: (images: ImageFile[]) => void;
  onUpload?: (file: File, onProgress: (progress: UploadProgress) => void) => Promise<{ url: string; key: string } | null>;
  maxFiles?: number;
  maxSizeMB?: number;
  minFiles?: number;
  disabled?: boolean;
  className?: string;
  showCoverBadge?: boolean;
  aspectRatio?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ImageUploader({
  images,
  onChange,
  onUpload,
  maxFiles = 20,
  maxSizeMB = 10,
  minFiles = 0,
  disabled = false,
  className,
  showCoverBadge = true,
  aspectRatio = '4/3',
}: ImageUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragItemRef = useRef<string | null>(null);
  const dragOverItemRef = useRef<string | null>(null);

  // Handle file selection
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || disabled) return;

    const remainingSlots = maxFiles - images.length;
    if (remainingSlots <= 0) return;

    const filesToAdd: ImageFile[] = [];
    const errors: string[] = [];

    for (let i = 0; i < Math.min(files.length, remainingSlots); i++) {
      const file = files[i];
      const validation = validateImageFile(file, maxSizeMB);

      if (!validation.valid) {
        errors.push(`${file.name}: ${validation.error}`);
        continue;
      }

      const id = `new-${Date.now()}-${i}`;
      filesToAdd.push({
        id,
        file,
        preview: createPreviewUrl(file),
        isExisting: false,
        status: onUpload ? 'pending' : 'success',
        progress: 0,
      });
    }

    if (errors.length > 0) {
      console.warn('File validation errors:', errors);
    }

    if (filesToAdd.length > 0) {
      const newImages = [...images, ...filesToAdd];
      onChange(newImages);

      // Auto-upload if handler provided
      if (onUpload) {
        setIsUploading(true);
        
        for (const imageFile of filesToAdd) {
          if (!imageFile.file) continue;

          // Update status to uploading
          updateImageStatus(imageFile.id, 'uploading', 0);

          try {
            const result = await onUpload(imageFile.file, (progress) => {
              updateImageProgress(imageFile.id, progress.percentage);
            });

            if (result) {
              updateImageSuccess(imageFile.id, result.url, result.key);
            } else {
              updateImageError(imageFile.id, 'Upload failed');
            }
          } catch (error) {
            updateImageError(
              imageFile.id,
              error instanceof Error ? error.message : 'Upload failed'
            );
          }
        }

        setIsUploading(false);
      }
    }
  }, [images, onChange, onUpload, maxFiles, maxSizeMB, disabled]);

  // Update helpers
  const updateImageStatus = (id: string, status: ImageFile['status'], progress: number) => {
    onChange(images.map(img => 
      img.id === id ? { ...img, status, progress } : img
    ));
  };

  const updateImageProgress = (id: string, progress: number) => {
    onChange(images.map(img => 
      img.id === id ? { ...img, progress } : img
    ));
  };

  const updateImageSuccess = (id: string, url: string, key: string) => {
    onChange(images.map(img => 
      img.id === id ? { ...img, status: 'success' as const, progress: 100, url, key } : img
    ));
  };

  const updateImageError = (id: string, error: string) => {
    onChange(images.map(img => 
      img.id === id ? { ...img, status: 'error' as const, error } : img
    ));
  };

  // Remove image
  const removeImage = useCallback((id: string) => {
    const image = images.find(img => img.id === id);
    if (image && !image.isExisting && image.preview.startsWith('blob:')) {
      revokePreviewUrl(image.preview);
    }
    onChange(images.filter(img => img.id !== id));
  }, [images, onChange]);

  // Retry failed upload
  const retryUpload = useCallback(async (id: string) => {
    if (!onUpload) return;

    const image = images.find(img => img.id === id);
    if (!image?.file) return;

    updateImageStatus(id, 'uploading', 0);

    try {
      const result = await onUpload(image.file, (progress) => {
        updateImageProgress(id, progress.percentage);
      });

      if (result) {
        updateImageSuccess(id, result.url, result.key);
      } else {
        updateImageError(id, 'Upload failed');
      }
    } catch (error) {
      updateImageError(id, error instanceof Error ? error.message : 'Upload failed');
    }
  }, [images, onUpload, onChange]);

  // Drag and drop reordering
  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragItemRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (id: string) => {
    dragOverItemRef.current = id;
  };

  const handleDragEnd = () => {
    if (dragItemRef.current && dragOverItemRef.current && dragItemRef.current !== dragOverItemRef.current) {
      const dragIndex = images.findIndex(img => img.id === dragItemRef.current);
      const dropIndex = images.findIndex(img => img.id === dragOverItemRef.current);

      if (dragIndex !== -1 && dropIndex !== -1) {
        const newImages = [...images];
        const [draggedItem] = newImages.splice(dragIndex, 1);
        newImages.splice(dropIndex, 0, draggedItem);
        onChange(newImages);
      }
    }

    dragItemRef.current = null;
    dragOverItemRef.current = null;
  };

  // Drop zone handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    if (!disabled && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const canAddMore = images.length < maxFiles;
  const hasMinimum = images.length >= minFiles;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drop Zone */}
      {canAddMore && (
        <div
          className={cn(
            'border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer',
            isDragOver
              ? 'border-luxury-gold bg-luxury-champagne/20'
              : 'border-surface-300 hover:border-luxury-gold hover:bg-luxury-champagne/10',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={disabled}
          />
          
          <Upload className={cn(
            'h-10 w-10 mx-auto mb-3',
            isDragOver ? 'text-luxury-gold' : 'text-surface-400'
          )} />
          
          <p className="text-base font-medium text-surface-700 mb-1">
            {isDragOver ? 'Drop photos here' : 'Drop photos or click to upload'}
          </p>
          <p className="text-sm text-surface-400">
            JPG, PNG, or WebP up to {maxSizeMB}MB each
          </p>
          <p className="text-xs text-surface-400 mt-2">
            {images.length} of {maxFiles} photos
            {minFiles > 0 && !hasMinimum && (
              <span className="text-amber-600 ml-2">
                (minimum {minFiles} required)
              </span>
            )}
          </p>
        </div>
      )}

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.map((image, index) => (
            <div
              key={image.id}
              draggable={!disabled && image.status === 'success'}
              onDragStart={(e) => handleDragStart(e, image.id)}
              onDragEnter={() => handleDragEnter(image.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className={cn(
                'relative group rounded-xl overflow-hidden border-2 transition-all',
                index === 0 && showCoverBadge ? 'border-luxury-gold' : 'border-surface-200',
                image.status === 'error' && 'border-red-400',
                image.status === 'uploading' && 'border-blue-400',
                !disabled && image.status === 'success' && 'cursor-grab active:cursor-grabbing'
              )}
              style={{ aspectRatio }}
            >
              {/* Image Preview */}
              <img
                src={image.url || image.preview}
                alt={`Photo ${index + 1}`}
                className={cn(
                  'w-full h-full object-cover',
                  image.status === 'uploading' && 'opacity-50'
                )}
              />

              {/* Cover Badge */}
              {index === 0 && showCoverBadge && image.status !== 'error' && (
                <div className="absolute top-2 left-2">
                  <Badge variant="gold" className="text-xs">Cover</Badge>
                </div>
              )}

              {/* Drag Handle */}
              {!disabled && image.status === 'success' && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-black/60 rounded p-1">
                    <GripVertical className="h-4 w-4 text-white" />
                  </div>
                </div>
              )}

              {/* Upload Progress */}
              {image.status === 'uploading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div className="text-center text-white">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm font-medium">{image.progress}%</p>
                  </div>
                </div>
              )}

              {/* Error State */}
              {image.status === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-500/80">
                  <div className="text-center text-white p-2">
                    <AlertCircle className="h-6 w-6 mx-auto mb-1" />
                    <p className="text-xs mb-2">{image.error || 'Upload failed'}</p>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={(e) => {
                        e.stopPropagation();
                        retryUpload(image.id);
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              )}

              {/* Success Indicator */}
              {image.status === 'success' && image.isExisting && (
                <div className="absolute bottom-2 left-2">
                  <Badge variant="default" className="text-xs">Existing</Badge>
                </div>
              )}

              {/* Remove Button */}
              {!disabled && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(image.id);
                  }}
                  className={cn(
                    'absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white',
                    'opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600'
                  )}
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {/* Hover Overlay for reordering hint */}
              {!disabled && image.status === 'success' && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {images.length > 0 && (
        <div className="flex items-center justify-between text-sm text-surface-600 px-1">
          <span>
            {images.length} photo{images.length !== 1 ? 's' : ''}
            {images.filter(i => i.status === 'uploading').length > 0 && (
              <span className="text-blue-600 ml-2">
                ({images.filter(i => i.status === 'uploading').length} uploading...)
              </span>
            )}
            {images.filter(i => i.status === 'error').length > 0 && (
              <span className="text-red-600 ml-2">
                ({images.filter(i => i.status === 'error').length} failed)
              </span>
            )}
          </span>
          {!hasMinimum && (
            <span className="text-amber-600">
              Add {minFiles - images.length} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ImageUploader;
