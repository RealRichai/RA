'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';
import api from '@/lib/api-client';
import type { Application } from '@/types';
import {
  FileText,
  Search,
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';

const STATUS_STEPS = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'SCREENING',
  'CONDITIONAL_OFFER',
  'APPROVED',
  'LEASE_SENT',
  'LEASE_SIGNED',
];

export default function ApplicationsPage() {
  const { user, isLandlord, isAgent, isTenant } = useAuth();
  const [applications, setApplications] = React.useState<Application[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);

  React.useEffect(() => {
    async function loadApplications() {
      try {
        const response = isTenant
          ? await api.getMyApplications({ status: statusFilter || undefined, page, limit: 10 })
          : await api.getApplications({ status: statusFilter || undefined, page, limit: 10 });
        setApplications(response.applications || []);
        setTotalPages(response.totalPages || 1);
      } catch (error) {
        console.error('Failed to load applications:', error);
      } finally {
        setLoading(false);
      }
    }

    loadApplications();
  }, [statusFilter, page, isTenant]);

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const response = await api.updateApplicationStatus(id, status);
      setApplications((prev) =>
        prev.map((app) => (app.id === id ? response.application : app))
      );
    } catch (error) {
      console.error('Failed to update application:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground">Loading applications...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-semibold">Applications</h1>
        <p className="text-muted-foreground">
          {isTenant ? 'Track your rental applications' : 'Review and manage applications'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search applications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">All Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="SCREENING">Screening</option>
          <option value="CONDITIONAL_OFFER">Conditional Offer</option>
          <option value="APPROVED">Approved</option>
          <option value="DENIED">Denied</option>
          <option value="WITHDRAWN">Withdrawn</option>
        </select>
      </div>

      {/* Applications list */}
      {applications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No applications found</h3>
            <p className="text-muted-foreground">
              {statusFilter
                ? 'Try adjusting your filters'
                : isTenant
                ? 'Browse listings and submit an application'
                : 'Applications will appear here when tenants apply'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {applications.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              isTenant={isTenant}
              onUpdateStatus={handleUpdateStatus}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function ApplicationCard({
  application,
  isTenant,
  onUpdateStatus,
}: {
  application: Application;
  isTenant: boolean;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  const currentStep = STATUS_STEPS.indexOf(application.status);
  const isTerminal = ['DENIED', 'WITHDRAWN', 'LEASE_SIGNED'].includes(application.status);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          {/* Left: Property info */}
          <div className="flex-1">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-medium">
                  {application.listing?.address || 'Unknown Property'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {application.listing?.neighborhood}, {application.listing?.city}
                </p>
              </div>
              <Badge className={getStatusColor(application.status)}>
                {application.status.replace(/_/g, ' ')}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mt-4">
              <div>
                <span className="text-muted-foreground">Monthly Income</span>
                <p className="font-medium">{formatCurrency(application.monthlyIncome)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Occupants</span>
                <p className="font-medium">{application.numberOfOccupants}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Move-in Date</span>
                <p className="font-medium">
                  {application.moveInDate ? formatDate(application.moveInDate) : 'Flexible'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Applied</span>
                <p className="font-medium">{formatDate(application.createdAt)}</p>
              </div>
            </div>

            {/* Fair Chance Housing Notice */}
            {application.criminalHistoryDeferred && !isTerminal && currentStep < 3 && (
              <div className="mt-4 p-3 bg-muted rounded-md text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <span>
                    Per Fair Chance Housing Act, criminal history inquiry deferred until conditional offer
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2 lg:w-40">
            <Link href={`/dashboard/applications/${application.id}`} className="flex-1">
              <Button variant="outline" className="w-full">
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </Button>
            </Link>

            {!isTenant && !isTerminal && (
              <>
                {application.status === 'SUBMITTED' && (
                  <Button
                    className="flex-1"
                    onClick={() => onUpdateStatus(application.id, 'UNDER_REVIEW')}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Start Review
                  </Button>
                )}
                {application.status === 'UNDER_REVIEW' && (
                  <Button
                    className="flex-1"
                    onClick={() => onUpdateStatus(application.id, 'SCREENING')}
                  >
                    Begin Screening
                  </Button>
                )}
                {application.status === 'SCREENING' && (
                  <Button
                    className="flex-1"
                    onClick={() => onUpdateStatus(application.id, 'CONDITIONAL_OFFER')}
                  >
                    Make Offer
                  </Button>
                )}
                {application.status === 'CONDITIONAL_OFFER' && (
                  <Button
                    className="flex-1"
                    onClick={() => onUpdateStatus(application.id, 'APPROVED')}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Progress tracker */}
        {!isTerminal && (
          <div className="mt-6 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              {STATUS_STEPS.map((step, index) => {
                const isComplete = currentStep > index;
                const isCurrent = currentStep === index;
                return (
                  <React.Fragment key={step}>
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                          isComplete
                            ? 'bg-green-500 text-white'
                            : isCurrent
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {isComplete ? <CheckCircle className="h-4 w-4" /> : index + 1}
                      </div>
                      <span className="text-xs text-muted-foreground mt-1 hidden sm:block">
                        {step.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {index < STATUS_STEPS.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mx-2 ${
                          currentStep > index ? 'bg-green-500' : 'bg-muted'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
