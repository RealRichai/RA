const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  httpStatus: number;
}

interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    hasMore?: boolean;
  };
}

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(baseURL: string) {
    this.baseUrl = baseURL;
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('accessToken');
      this.refreshToken = localStorage.getItem('refreshToken');
    }
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
    }
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    // Prevent multiple refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });

        if (!response.ok) {
          this.clearTokens();
          return false;
        }

        const data = await response.json();
        this.setTokens(data.data.accessToken, data.data.refreshToken);
        return true;
      } catch {
        this.clearTokens();
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      let response = await fetch(url, { ...options, headers });

      // Handle 401 - try to refresh token
      if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Retry with new token
          (headers as Record<string, string>)['Authorization'] = `Bearer ${this.accessToken}`;
          response = await fetch(url, { ...options, headers });
        } else {
          // Refresh failed, redirect to login
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
          return {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Session expired. Please log in again.',
              httpStatus: 401,
            },
          };
        }
      }

      const data = await response.json();

      if (!response.ok) {
        return {
          error: data.error || {
            code: 'UNKNOWN_ERROR',
            message: 'An unexpected error occurred',
            httpStatus: response.status,
          },
        };
      }

      return data;
    } catch (error) {
      console.error('API request failed:', error);
      return {
        error: {
          code: 'NETWORK_ERROR',
          message: 'Unable to connect to server. Please check your connection.',
          httpStatus: 0,
        },
      };
    }
  }

  async get<T>(endpoint: string, params?: Record<string, string | number | boolean>): Promise<ApiResponse<T>> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    return this.request<T>(url.toString(), { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // File upload
  async upload<T>(endpoint: string, file: File, fieldName = 'file'): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append(fieldName, file);

    const headers: HeadersInit = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        return { error: data.error };
      }
      return data;
    } catch {
      return {
        error: {
          code: 'UPLOAD_ERROR',
          message: 'File upload failed',
          httpStatus: 0,
        },
      };
    }
  }
}

export const api = new ApiClient(API_BASE);

// Auth API
export const authApi = {
  async login(email: string, password: string) {
    const response = await api.post<{
      user: User;
      accessToken: string;
      refreshToken: string;
    }>('/auth/login', { email, password });

    if (response.data) {
      api.setTokens(response.data.accessToken, response.data.refreshToken);
    }
    return response;
  },

  async register(data: RegisterInput) {
    const response = await api.post<{
      user: User;
      accessToken: string;
      refreshToken: string;
    }>('/auth/register', data);

    if (response.data) {
      api.setTokens(response.data.accessToken, response.data.refreshToken);
    }
    return response;
  },

  async logout() {
    const response = await api.post('/auth/logout');
    api.clearTokens();
    return response;
  },

  async me() {
    return api.get<User>('/auth/me');
  },

  async forgotPassword(email: string) {
    return api.post('/auth/forgot-password', { email });
  },

  async resetPassword(token: string, password: string) {
    return api.post('/auth/reset-password', { token, password });
  },
};

// Listings API
export const listingsApi = {
  search(params: ListingSearchParams) {
    return api.get<{ listings: Listing[]; total: number }>('/listings', params as Record<string, string | number | boolean>);
  },

  get(id: string) {
    return api.get<Listing>(`/listings/${id}`);
  },

  create(data: CreateListingInput) {
    return api.post<Listing>('/listings', data);
  },

  update(id: string, data: Partial<CreateListingInput>) {
    return api.patch<Listing>(`/listings/${id}`, data);
  },

  publish(id: string) {
    return api.post<Listing>(`/listings/${id}/publish`);
  },

  unpublish(id: string) {
    return api.post<Listing>(`/listings/${id}/unpublish`);
  },

  delete(id: string) {
    return api.delete(`/listings/${id}`);
  },

  getFareActDisclosure(id: string) {
    return api.get<FareActDisclosure>(`/listings/${id}/fare-act-disclosure`);
  },

  // Photo Management
  uploadPhotos(id: string, files: File[]) {
    const formData = new FormData();
    files.forEach((file) => formData.append('photos', file));
    return api.upload<{ urls: string[] }>(`/listings/${id}/photos`, files[0], 'photos');
  },

  getPhotoPresignUrl(id: string, filename: string, contentType: string) {
    return api.post<{
      uploadUrl: string;
      publicUrl: string;
      key: string;
      expiresAt: string;
    }>(`/listings/${id}/photos/presign`, { filename, contentType });
  },

  getPhotoPresignUrlsBatch(id: string, files: { filename: string; contentType: string }[]) {
    return api.post<{
      urls: Array<{
        uploadUrl: string;
        publicUrl: string;
        key: string;
        expiresAt: string;
      }>;
    }>(`/listings/${id}/photos/presign-batch`, { files });
  },

  confirmPhotoUpload(id: string, key: string) {
    return api.post<{ success: boolean }>(`/listings/${id}/photos/confirm`, { key });
  },

  deletePhoto(id: string, photoKey: string) {
    return api.delete(`/listings/${id}/photos/${encodeURIComponent(photoKey)}`);
  },

  reorderPhotos(id: string, photoKeys: string[]) {
    return api.put(`/listings/${id}/photos/reorder`, { photoKeys });
  },
};

// Applications API
export const applicationsApi = {
  create(listingId: string, data: CreateApplicationInput) {
    return api.post<Application>(`/listings/${listingId}/applications`, data);
  },

  get(id: string) {
    return api.get<Application>(`/applications/${id}`);
  },

  getMyApplications() {
    return api.get<Application[]>('/applications/me');
  },

  getForListing(listingId: string) {
    return api.get<Application[]>(`/listings/${listingId}/applications`);
  },

  updateStatus(id: string, status: ApplicationStatus, notes?: string) {
    return api.patch<Application>(`/applications/${id}/status`, { status, notes });
  },

  uploadDocument(id: string, file: File, documentType: string) {
    return api.upload<Document>(`/applications/${id}/documents`, file, documentType);
  },
};

// Tours API
export const toursApi = {
  schedule(listingId: string, data: ScheduleTourInput) {
    return api.post<Tour>(`/listings/${listingId}/tours`, data);
  },

  getMyTours() {
    return api.get<Tour[]>('/tours/me');
  },

  getForListing(listingId: string) {
    return api.get<Tour[]>(`/listings/${listingId}/tours`);
  },

  confirm(id: string) {
    return api.post<Tour>(`/tours/${id}/confirm`);
  },

  cancel(id: string, reason?: string) {
    return api.post<Tour>(`/tours/${id}/cancel`, { reason });
  },

  getAccessCode(id: string) {
    return api.get<{ code: string; validUntil: string }>(`/tours/${id}/access-code`);
  },
};

// Payments API
export const paymentsApi = {
  createPaymentIntent(applicationId: string, type: 'application_fee' | 'security_deposit') {
    return api.post<{ clientSecret: string }>(`/applications/${applicationId}/payments`, { type });
  },

  getPaymentHistory() {
    return api.get<Payment[]>('/payments/me');
  },
};

// User API
export const userApi = {
  updateProfile(data: UpdateProfileInput) {
    return api.patch<User>('/users/me', data);
  },

  uploadAvatar(file: File) {
    return api.upload<{ avatarUrl: string }>('/users/me/avatar', file);
  },

  getSavedListings() {
    return api.get<Listing[]>('/users/me/saved-listings');
  },

  saveListing(listingId: string) {
    return api.post(`/users/me/saved-listings/${listingId}`);
  },

  unsaveListing(listingId: string) {
    return api.delete(`/users/me/saved-listings/${listingId}`);
  },
};

// Types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'TENANT' | 'LANDLORD' | 'AGENT' | 'INVESTOR' | 'ADMIN';
  phone?: string;
  avatarUrl?: string;
  emailVerified: boolean;
  subscriptionTier: 'FREE' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
  createdAt: string;
  updatedAt: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'TENANT' | 'LANDLORD' | 'AGENT' | 'INVESTOR';
  phone?: string;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  propertyType: 'APARTMENT' | 'HOUSE' | 'CONDO' | 'TOWNHOUSE' | 'STUDIO' | 'LOFT';
  status: 'DRAFT' | 'ACTIVE' | 'PENDING' | 'LEASED' | 'INACTIVE';
  price: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  address: {
    street: string;
    unit?: string;
    city: string;
    state: string;
    zipCode: string;
    latitude?: number;
    longitude?: number;
  };
  neighborhood?: string;
  borough?: string;
  amenities: string[];
  photos: string[];
  availableDate: string;
  leaseTermMonths: number;
  petsAllowed: boolean;
  petPolicy?: string;
  applicationFee: number;
  securityDeposit: number;
  brokerFee?: number;
  brokerFeePaidBy: 'LANDLORD' | 'TENANT';
  moveInCosts: {
    firstMonth: number;
    securityDeposit: number;
    brokerFee: number;
    applicationFee: number;
    total: number;
  };
  fareActCompliant: boolean;
  landlordId: string;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListingSearchParams {
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
  borough?: string;
  neighborhood?: string;
  amenities?: string[];
  petsAllowed?: boolean;
  availableBefore?: string;
  page?: number;
  limit?: number;
  sortBy?: 'price' | 'createdAt' | 'availableDate';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateListingInput {
  title: string;
  description: string;
  propertyType: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  address: {
    street: string;
    unit?: string;
    city: string;
    state: string;
    zipCode: string;
  };
  neighborhood?: string;
  amenities?: string[];
  availableDate: string;
  leaseTermMonths?: number;
  petsAllowed?: boolean;
  petPolicy?: string;
}

export interface FareActDisclosure {
  listingId: string;
  applicationFeeCapped: boolean;
  applicationFeeAmount: number;
  securityDepositCapped: boolean;
  securityDepositAmount: number;
  brokerFeePaidBy: 'LANDLORD' | 'TENANT';
  brokerFeeAmount?: number;
  moveInCosts: {
    firstMonth: number;
    securityDeposit: number;
    brokerFee: number;
    applicationFee: number;
    total: number;
  };
  generatedAt: string;
}

export interface Application {
  id: string;
  listingId: string;
  listing?: Listing;
  tenantId: string;
  tenant?: User;
  status: ApplicationStatus;
  employmentInfo: {
    employer: string;
    position: string;
    annualIncome: number;
    employmentLength: string;
  };
  documents: Document[];
  screeningResults?: {
    creditScore?: number;
    backgroundCheckStatus?: string;
    incomeVerified?: boolean;
  };
  notes?: string;
  applicationFeeStatus: 'PENDING' | 'PAID' | 'WAIVED';
  applicationFeePaidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'SCREENING'
  | 'CONDITIONAL_OFFER'
  | 'APPROVED'
  | 'DENIED'
  | 'WITHDRAWN';

export interface CreateApplicationInput {
  employmentInfo: {
    employer: string;
    position: string;
    annualIncome: number;
    employmentLength: string;
  };
  moveInDate?: string;
  additionalOccupants?: number;
  pets?: { type: string; breed?: string; weight?: number }[];
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
}

export interface Document {
  id: string;
  type: string;
  name: string;
  url: string;
  uploadedAt: string;
}

export interface Tour {
  id: string;
  listingId: string;
  listing?: Listing;
  tenantId: string;
  tenant?: User;
  type: 'SELF_GUIDED' | 'AGENT_LED';
  scheduledAt: string;
  duration: number;
  status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  accessCode?: string;
  accessCodeValidUntil?: string;
  notes?: string;
  cancelReason?: string;
  createdAt: string;
}

export interface ScheduleTourInput {
  type: 'SELF_GUIDED' | 'AGENT_LED';
  scheduledAt: string;
  notes?: string;
}

export interface Payment {
  id: string;
  type: string;
  amount: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  description: string;
  stripePaymentIntentId?: string;
  createdAt: string;
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
}
