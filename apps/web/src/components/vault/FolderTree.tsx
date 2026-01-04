'use client';

import { Folder, FolderOpen, FileText, Check, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { VaultFolder, DocumentCategory } from './types';
import { VAULT_FOLDER_LABELS, CATEGORY_LABELS } from './types';

interface FolderTreeProps {
  propertyId: string;
  folders: {
    name: VaultFolder;
    categories: DocumentCategory[];
  }[];
  uploadedDocs: DocumentCategory[];
  requiredDocs: DocumentCategory[];
}

export function FolderTree({
  propertyId,
  folders,
  uploadedDocs,
  requiredDocs,
}: FolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<VaultFolder[]>(
    folders.map((f) => f.name)
  );

  const toggleFolder = (folder: VaultFolder) => {
    setExpandedFolders((prev) =>
      prev.includes(folder)
        ? prev.filter((f) => f !== folder)
        : [...prev, folder]
    );
  };

  const isUploaded = (category: DocumentCategory) =>
    uploadedDocs.includes(category);

  const isRequired = (category: DocumentCategory) =>
    requiredDocs.includes(category);

  const getFolderStatus = (categories: DocumentCategory[]) => {
    const requiredInFolder = categories.filter((cat) => isRequired(cat));
    if (requiredInFolder.length === 0) return 'optional';
    const allUploaded = requiredInFolder.every((cat) => isUploaded(cat));
    if (allUploaded) return 'complete';
    return 'incomplete';
  };

  return (
    <div className="space-y-1">
      {folders.map((folder) => {
        const isExpanded = expandedFolders.includes(folder.name);
        const status = getFolderStatus(folder.categories);

        return (
          <div key={folder.name}>
            <button
              onClick={() => toggleFolder(folder.name)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-accent/50 transition-colors"
            >
              {isExpanded ? (
                <FolderOpen className="h-4 w-4 text-amber-500" />
              ) : (
                <Folder className="h-4 w-4 text-amber-500" />
              )}
              <span className="font-medium flex-1 text-left">
                {VAULT_FOLDER_LABELS[folder.name]}
              </span>
              {status === 'complete' && (
                <Check className="h-4 w-4 text-green-500" />
              )}
              {status === 'incomplete' && (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
            </button>

            {isExpanded && (
              <div className="ml-6 space-y-0.5">
                {folder.categories.map((category) => (
                  <Link
                    key={category}
                    href={`/dashboard/properties/${propertyId}/vault/documents?category=${category}`}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/50 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span
                      className={`flex-1 text-sm ${
                        isUploaded(category) ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {CATEGORY_LABELS[category]}
                    </span>
                    {isRequired(category) && !isUploaded(category) && (
                      <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 px-1.5 py-0.5 rounded">
                        Required
                      </span>
                    )}
                    {isUploaded(category) && (
                      <Check className="h-3 w-3 text-green-500" />
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
