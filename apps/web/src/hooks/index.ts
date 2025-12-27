'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';
import {
  api,
  authApi,
  listingsApi,
  applicationsApi,
  toursApi,
  userApi,
  type User,
  type RegisterInput,
  type ListingSearchParams,
  type CreateListingInput,
  type CreateApplicationInput,
  type ScheduleTourInput,
  type UpdateProfileInput,
} from '@/lib/api';
import { toast } from '@/components/ui/toaster';

// Auth Hooks
export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout: clearAuth } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Initialize auth state from stored token
  const { refetch: fetchUser } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      if (!api.getAccessToken()) {
        setLoading(false);
        return null;
      }
      const response = await authApi.me();
      if (response.data) {
        setUser(response.data);
        return response.data;
      }
      clearAuth();
      return null;
    },
    enabled: isLoading,
    staleTime: 5 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (response) => {
      if (response.data) {
        setUser(response.data.user);
        queryClient.invalidateQueries({ queryKey: ['auth'] });
        toast({ title: 'Welcome back!', variant: 'success' });
        router.push('/dashboard');
      } else if (response.error) {
        toast({ title: 'Login failed', description: response.error.message, variant: 'error' });
      }
    },
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterInput) => authApi.register(data),
    onSuccess: (response) => {
      if (response.data) {
        setUser(response.data.user);
        queryClient.invalidateQueries({ queryKey: ['auth'] });
        toast({ title: 'Account created!', description: 'Welcome to RealRiches.', variant: 'success' });
        router.push('/dashboard');
      } else if (response.error) {
        toast({ title: 'Registration failed', description: response.error.message, variant: 'error' });
      }
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      clearAuth();
      queryClient.clear();
      router.push('/');
      toast({ title: 'Logged out', variant: 'success' });
    },
  });

  return {
    user,
    isAuthenticated,
    isLoading,
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout: logoutMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    fetchUser,
  };
}

// Require authentication hook
export function useRequireAuth(redirectTo = '/login') {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, redirectTo, router]);

  return { isAuthenticated, isLoading };
}

// Listings Hooks
export function useListings(params: ListingSearchParams = {}) {
  return useQuery({
    queryKey: ['listings', params],
    queryFn: () => listingsApi.search(params),
    select: (response) => response.data,
  });
}

export function useListing(id: string) {
  return useQuery({
    queryKey: ['listings', id],
    queryFn: () => listingsApi.get(id),
    select: (response) => response.data,
    enabled: !!id,
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (data: CreateListingInput) => listingsApi.create(data),
    onSuccess: (response) => {
      if (response.data) {
        queryClient.invalidateQueries({ queryKey: ['listings'] });
        toast({ title: 'Listing created!', variant: 'success' });
        router.push(`/listings/${response.data.id}`);
      } else if (response.error) {
        toast({ title: 'Failed to create listing', description: response.error.message, variant: 'error' });
      }
    },
  });
}

export function useUpdateListing(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<CreateListingInput>) => listingsApi.update(id, data),
    onSuccess: (response) => {
      if (response.data) {
        queryClient.invalidateQueries({ queryKey: ['listings', id] });
        queryClient.invalidateQueries({ queryKey: ['listings'] });
        toast({ title: 'Listing updated', variant: 'success' });
      } else if (response.error) {
        toast({ title: 'Update failed', description: response.error.message, variant: 'error' });
      }
    },
  });
}

export function usePublishListing(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => listingsApi.publish(id),
    onSuccess: (response) => {
      if (response.data) {
        queryClient.invalidateQueries({ queryKey: ['listings', id] });
        queryClient.invalidateQueries({ queryKey: ['listings'] });
        toast({ title: 'Listing published!', variant: 'success' });
      }
    },
  });
}

export function useFareActDisclosure(listingId: string) {
  return useQuery({
    queryKey: ['listings', listingId, 'fare-act'],
    queryFn: () => listingsApi.getFareActDisclosure(listingId),
    select: (response) => response.data,
    enabled: !!listingId,
  });
}

// Landlord's own listings
export function useMyListings() {
  return useQuery({
    queryKey: ['listings', 'me'],
    queryFn: () => listingsApi.search({ landlordId: 'me' } as any),
    select: (response) => response.data?.listings ?? [],
  });
}

export function useDeleteListing(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => listingsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      toast({ title: 'Listing deleted', variant: 'success' });
    },
    onError: () => {
      toast({ title: 'Failed to delete listing', variant: 'error' });
    },
  });
}

export function useUnpublishListing(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => listingsApi.unpublish(id),
    onSuccess: (response) => {
      if (response.data) {
        queryClient.invalidateQueries({ queryKey: ['listings', id] });
        queryClient.invalidateQueries({ queryKey: ['listings'] });
        toast({ title: 'Listing unpublished', variant: 'info' });
      }
    },
  });
}

// Applications Hooks
export function useMyApplications() {
  return useQuery({
    queryKey: ['applications', 'me'],
    queryFn: () => applicationsApi.getMyApplications(),
    select: (response) => response.data,
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: ['applications', id],
    queryFn: () => applicationsApi.get(id),
    select: (response) => response.data,
    enabled: !!id,
  });
}

export function useListingApplications(listingId: string) {
  return useQuery({
    queryKey: ['listings', listingId, 'applications'],
    queryFn: () => applicationsApi.getForListing(listingId),
    select: (response) => response.data,
    enabled: !!listingId,
  });
}

export function useCreateApplication(listingId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (data: CreateApplicationInput) => applicationsApi.create(listingId, data),
    onSuccess: (response) => {
      if (response.data) {
        queryClient.invalidateQueries({ queryKey: ['applications'] });
        toast({ title: 'Application submitted!', variant: 'success' });
        router.push(`/applications/${response.data.id}`);
      } else if (response.error) {
        toast({ title: 'Submission failed', description: response.error.message, variant: 'error' });
      }
    },
  });
}

export function useUpdateApplicationStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ status, notes }: { status: string; notes?: string }) =>
      applicationsApi.updateStatus(id, status as any, notes),
    onSuccess: (response) => {
      if (response.data) {
        queryClient.invalidateQueries({ queryKey: ['applications', id] });
        queryClient.invalidateQueries({ queryKey: ['applications'] });
        toast({ title: 'Application status updated', variant: 'success' });
      }
    },
  });
}

// Tours Hooks
export function useMyTours() {
  return useQuery({
    queryKey: ['tours', 'me'],
    queryFn: () => toursApi.getMyTours(),
    select: (response) => response.data,
  });
}

export function useListingTours(listingId: string) {
  return useQuery({
    queryKey: ['listings', listingId, 'tours'],
    queryFn: () => toursApi.getForListing(listingId),
    select: (response) => response.data,
    enabled: !!listingId,
  });
}

export function useScheduleTour(listingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ScheduleTourInput) => toursApi.schedule(listingId, data),
    onSuccess: (response) => {
      if (response.data) {
        queryClient.invalidateQueries({ queryKey: ['tours'] });
        toast({ title: 'Tour scheduled!', description: 'Check your email for confirmation.', variant: 'success' });
      } else if (response.error) {
        toast({ title: 'Scheduling failed', description: response.error.message, variant: 'error' });
      }
    },
  });
}

export function useConfirmTour(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => toursApi.confirm(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      toast({ title: 'Tour confirmed', variant: 'success' });
    },
  });
}

export function useCancelTour(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reason?: string) => toursApi.cancel(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      toast({ title: 'Tour cancelled', variant: 'info' });
    },
  });
}

export function useTourAccessCode(id: string) {
  return useQuery({
    queryKey: ['tours', id, 'access-code'],
    queryFn: () => toursApi.getAccessCode(id),
    select: (response) => response.data,
    enabled: !!id,
  });
}

// User Profile Hooks
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { setUser } = useAuthStore();

  return useMutation({
    mutationFn: (data: UpdateProfileInput) => userApi.updateProfile(data),
    onSuccess: (response) => {
      if (response.data) {
        setUser(response.data);
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
        toast({ title: 'Profile updated', variant: 'success' });
      }
    },
  });
}

export function useSavedListings() {
  return useQuery({
    queryKey: ['user', 'saved-listings'],
    queryFn: () => userApi.getSavedListings(),
    select: (response) => response.data,
  });
}

export function useSaveListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listingId: string) => userApi.saveListing(listingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'saved-listings'] });
      toast({ title: 'Listing saved', variant: 'success' });
    },
  });
}

export function useUnsaveListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listingId: string) => userApi.unsaveListing(listingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'saved-listings'] });
      toast({ title: 'Listing removed', variant: 'info' });
    },
  });
}

// =============================================================================
// Image Upload Hooks
// =============================================================================

import {
  uploadListingPhoto,
  uploadListingPhotos,
  deleteListingPhoto,
  reorderListingPhotos,
  type UploadResult,
  type UploadProgress,
} from '@/lib/upload';

export interface UploadState {
  isUploading: boolean;
  progress: number;
  results: UploadResult[];
  errors: string[];
}

export function useUploadListingPhoto(listingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, onProgress }: { file: File; onProgress?: (progress: UploadProgress) => void }) => {
      const result = await uploadListingPhoto(listingId, file, { onProgress });
      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings', listingId] });
      toast({ title: 'Photo uploaded', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: 'Upload failed', description: error.message, variant: 'error' });
    },
  });
}

export function useUploadListingPhotos(listingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      files,
      onFileProgress,
      onFileComplete,
    }: {
      files: File[];
      onFileProgress?: (index: number, progress: UploadProgress) => void;
      onFileComplete?: (index: number, result: UploadResult) => void;
    }) => {
      const results = await uploadListingPhotos(listingId, files, {
        onFileProgress,
        onFileComplete,
      });
      
      const failedCount = results.filter(r => !r.success).length;
      if (failedCount === results.length) {
        throw new Error('All uploads failed');
      }
      
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['listings', listingId] });
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.length - successCount;
      
      if (failedCount > 0) {
        toast({
          title: 'Upload partially complete',
          description: `${successCount} of ${results.length} photos uploaded`,
          variant: 'warning',
        });
      } else {
        toast({ title: `${successCount} photos uploaded`, variant: 'success' });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Upload failed', description: error.message, variant: 'error' });
    },
  });
}

export function useDeleteListingPhoto(listingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (photoKey: string) => deleteListingPhoto(listingId, photoKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings', listingId] });
      toast({ title: 'Photo deleted', variant: 'success' });
    },
    onError: () => {
      toast({ title: 'Failed to delete photo', variant: 'error' });
    },
  });
}

export function useReorderListingPhotos(listingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (photoKeys: string[]) => reorderListingPhotos(listingId, photoKeys),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings', listingId] });
    },
    onError: () => {
      toast({ title: 'Failed to reorder photos', variant: 'error' });
    },
  });
}

// =============================================================================
// Notification Hooks
// =============================================================================

import {
  notificationsApi,
  useNotificationStore,
  type Notification,
} from '@/lib/notifications';

export function useNotifications(options?: { unreadOnly?: boolean; limit?: number }) {
  const { setNotifications, setUnreadCount, setLoading, setError } = useNotificationStore();

  return useQuery({
    queryKey: ['notifications', options],
    queryFn: async () => {
      const response = await notificationsApi.getAll(options);
      if (response.data) {
        setNotifications(response.data.notifications);
        setUnreadCount(response.data.unreadCount);
        return response.data;
      }
      throw new Error(response.error?.message || 'Failed to fetch notifications');
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute
  });
}

export function useUnreadNotificationCount() {
  const { unreadCount, setUnreadCount } = useNotificationStore();

  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const response = await notificationsApi.getUnreadCount();
      if (response.data) {
        setUnreadCount(response.data.count);
        return response.data.count;
      }
      return unreadCount;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  return data ?? unreadCount;
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();
  const { markAsRead } = useNotificationStore();

  return useMutation({
    mutationFn: (id: string) => notificationsApi.markAsRead(id),
    onMutate: (id) => {
      markAsRead(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();
  const { markAllAsRead } = useNotificationStore();

  return useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onMutate: () => {
      markAllAsRead();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({ title: 'All notifications marked as read', variant: 'success' });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  const { removeNotification } = useNotificationStore();

  return useMutation({
    mutationFn: (id: string) => notificationsApi.delete(id),
    onMutate: (id) => {
      removeNotification(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
