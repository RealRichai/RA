'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, Upload, Download, Eye, Folder, Lock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { NonCustodialDisclaimer } from '@/components/co-purchase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

interface Document {
  id: string;
  documentKey: string;
  category: string;
  description: string | null;
  visibleToAll: boolean;
  uploadedAt: string;
  uploadedBy: {
    firstName: string;
    lastName: string;
  };
}

interface GroupDetails {
  id: string;
  name: string;
  members: Array<{
    id: string;
    userId: string;
    role: 'organizer' | 'member' | 'viewer';
  }>;
  documents: Document[];
}

const categoryIcons: Record<string, typeof FileText> = {
  'Pre-Approval': FileText,
  'Legal': FileText,
  'Financial': FileText,
  'Property': FileText,
  'Identity': Lock,
  'Other': Folder,
};

export default function DocumentsPage() {
  const params = useParams();
  const groupId = params.groupId as string;
  const user = useAuthStore((state) => state.user);

  const { data: group, isLoading } = useQuery({
    queryKey: ['co-purchase-group-documents', groupId],
    queryFn: async () => {
      const response = await api.get<{ group: GroupDetails }>(`/co-purchase/groups/${groupId}`);
      return response.data?.group;
    },
  });

  if (isLoading || !group) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  const currentMember = group.members.find((m) => m.userId === user?.id);
  const canUpload = currentMember?.role === 'organizer' || currentMember?.role === 'member';

  const groupedDocuments = (group.documents || []).reduce(
    (acc, doc) => {
      const category = doc.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(doc);
      return acc;
    },
    {} as Record<string, Document[]>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/groups/${groupId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Document Vault</h1>
            <p className="text-muted-foreground">{group.name}</p>
          </div>
        </div>
        {canUpload && (
          <Button>
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        )}
      </div>

      <NonCustodialDisclaimer compact />

      {/* Document Categories */}
      {Object.keys(groupedDocuments).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedDocuments).map(([category, docs]) => {
            const CategoryIcon = categoryIcons[category] || FileText;
            return (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CategoryIcon className="h-5 w-5" />
                    {category}
                  </CardTitle>
                  <CardDescription>{docs.length} document(s)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {docs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{doc.documentKey.split('/').pop()}</p>
                            <p className="text-sm text-muted-foreground">
                              Uploaded by {doc.uploadedBy.firstName} {doc.uploadedBy.lastName} on{' '}
                              {formatDate(doc.uploadedAt)}
                            </p>
                            {doc.description && (
                              <p className="text-sm text-muted-foreground">{doc.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!doc.visibleToAll && (
                            <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 px-2 py-1 rounded-full">
                              Restricted
                            </span>
                          )}
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              Upload documents like pre-approval letters, identification, and property research
              to share with your group.
            </p>
            {canUpload && (
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Upload First Document
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
