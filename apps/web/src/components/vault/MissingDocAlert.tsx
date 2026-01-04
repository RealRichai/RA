'use client';

import { AlertTriangle, Upload } from 'lucide-react';
import Link from 'next/link';

import type { DocumentCategory } from './types';
import { CATEGORY_LABELS } from './types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface MissingDocAlertProps {
  propertyId: string;
  missingDocs: DocumentCategory[];
  onUploadClick?: (category: DocumentCategory) => void;
}

export function MissingDocAlert({
  propertyId,
  missingDocs,
  onUploadClick,
}: MissingDocAlertProps) {
  if (missingDocs.length === 0) {
    return null;
  }

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-5 w-5" />
          Missing Required Documents
        </CardTitle>
        <CardDescription>
          Upload these documents to complete your vault setup
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {missingDocs.map((category) => (
            <div
              key={category}
              className="flex items-center justify-between p-2 bg-amber-50 dark:bg-amber-950/50 rounded-lg"
            >
              <span className="font-medium text-sm">
                {CATEGORY_LABELS[category]}
              </span>
              {onUploadClick ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onUploadClick(category)}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Upload
                </Button>
              ) : (
                <Link
                  href={`/dashboard/properties/${propertyId}/vault/upload?category=${category}`}
                >
                  <Button size="sm" variant="outline">
                    <Upload className="h-3 w-3 mr-1" />
                    Upload
                  </Button>
                </Link>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
