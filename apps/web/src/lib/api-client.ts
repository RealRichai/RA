/**
 * API Client
 * Typed HTTP client for backend API communication
 */

import type {
  User,
  AuthResponse,
  Listing,
  Application,
  Lease,
  Payment,
  Lead,
  Tour,
  Notification,
  AgentFeedback,
  PaginatedResponse,
  ApiError,
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// =============================================================================
// HTTP CLIENT
// =============================================================================

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    options: {
      body?: unknown;
      params?: Record<string, string | number | boolean | undefined>;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v1${endpoint}`);

    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: { code: 'UNKNOWN_ERROR', message: 'An unknown error occurred' },
      }));
      throw new ApiClientError(
        error.error?.message || 'Request failed',
        error.error?.code || 'UNKNOWN_ERROR',
        response.status,
        error.error?.details
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // ===========================================================================
  // AUTH
  // ===========================================================================

  async login(email: string, password: string): Promise<AuthResponse> {
    const result = await this.request<AuthResponse>('POST', '/auth/login', {
      body: { email, password },
    });
    this.setAccessToken(result.tokens.accessToken);
    return result;
  }

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: string;
  }): Promise<AuthResponse> {
    const result = await this.request<AuthResponse>('POST', '/auth/register', {
      body: data,
    });
    this.setAccessToken(result.tokens.accessToken);
    return result;
  }

  async logout(): Promise<void> {
    await this.request<void>('POST', '/auth/logout');
    this.setAccessToken(null);
  }

  async refreshTokens(): Promise<AuthResponse> {
    const result = await this.request<AuthResponse>('POST', '/auth/refresh');
    this.setAccessToken(result.tokens.accessToken);
    return result;
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    return this.request('POST', '/auth/forgot-password', { body: { email } });
  }

  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    return this.request('POST', '/auth/reset-password', { body: { token, password } });
  }

  // ===========================================================================
  // USERS
  // ===========================================================================

  async getMe(): Promise<{ user: User }> {
    return this.request('GET', '/users/me');
  }

  async updateMe(data: Partial<User>): Promise<{ user: User }> {
    return this.request('PATCH', '/users/me', { body: data });
  }

  async getUser(id: string): Promise<{ user: User }> {
    return this.request('GET', `/users/${id}`);
  }

  async listUsers(params?: {
    role?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<User>> {
    return this.request('GET', '/users', { params });
  }

  // ===========================================================================
  // LISTINGS
  // ===========================================================================

  async getListings(params?: {
    type?: string;
    status?: string;
    propertyType?: string;
    minPrice?: number;
    maxPrice?: number;
    minBedrooms?: number;
    maxBedrooms?: number;
    city?: string;
    borough?: string;
    neighborhood?: string;
    amenities?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<PaginatedResponse<Listing> & { listings: Listing[] }> {
    return this.request('GET', '/listings', { params });
  }

  async getListing(id: string): Promise<{ listing: Listing }> {
    return this.request('GET', `/listings/${id}`);
  }

  async createListing(data: Partial<Listing>): Promise<{ listing: Listing }> {
    return this.request('POST', '/listings', { body: data });
  }

  async updateListing(id: string, data: Partial<Listing>): Promise<{ listing: Listing }> {
    return this.request('PATCH', `/listings/${id}`, { body: data });
  }

  async deleteListing(id: string): Promise<void> {
    return this.request('DELETE', `/listings/${id}`);
  }

  async publishListing(id: string): Promise<{ listing: Listing }> {
    return this.request('POST', `/listings/${id}/publish`);
  }

  async getMyListings(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Listing> & { listings: Listing[] }> {
    return this.request('GET', '/listings/mine', { params });
  }

  // ===========================================================================
  // APPLICATIONS
  // ===========================================================================

  async getApplications(params?: {
    status?: string;
    listingId?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Application> & { applications: Application[] }> {
    return this.request('GET', '/applications', { params });
  }

  async getApplication(id: string): Promise<{ application: Application }> {
    return this.request('GET', `/applications/${id}`);
  }

  async createApplication(data: Partial<Application>): Promise<{ application: Application }> {
    return this.request('POST', '/applications', { body: data });
  }

  async updateApplication(id: string, data: Partial<Application>): Promise<{ application: Application }> {
    return this.request('PATCH', `/applications/${id}`, { body: data });
  }

  async updateApplicationStatus(
    id: string,
    status: string,
    notes?: string
  ): Promise<{ application: Application }> {
    return this.request('PATCH', `/applications/${id}/status`, {
      body: { status, notes },
    });
  }

  async withdrawApplication(id: string): Promise<void> {
    return this.request('POST', `/applications/${id}/withdraw`);
  }

  async getMyApplications(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Application> & { applications: Application[] }> {
    return this.request('GET', '/applications/mine', { params });
  }

  // ===========================================================================
  // LEASES
  // ===========================================================================

  async getLeases(params?: {
    status?: string;
    tenantId?: string;
    landlordId?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Lease> & { leases: Lease[] }> {
    return this.request('GET', '/leases', { params });
  }

  async getLease(id: string): Promise<{ lease: Lease }> {
    return this.request('GET', `/leases/${id}`);
  }

  async createLease(data: Partial<Lease>): Promise<{ lease: Lease }> {
    return this.request('POST', '/leases', { body: data });
  }

  async updateLease(id: string, data: Partial<Lease>): Promise<{ lease: Lease }> {
    return this.request('PATCH', `/leases/${id}`, { body: data });
  }

  async activateLease(id: string): Promise<{ lease: Lease }> {
    return this.request('POST', `/leases/${id}/activate`);
  }

  async getMyLeases(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Lease> & { leases: Lease[] }> {
    return this.request('GET', '/leases/mine', { params });
  }

  async getExpiringLeases(days?: number): Promise<{ leases: Lease[] }> {
    return this.request('GET', '/leases/expiring', { params: { days } });
  }

  // ===========================================================================
  // PAYMENTS
  // ===========================================================================

  async getPayments(params?: {
    status?: string;
    type?: string;
    leaseId?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Payment> & { payments: Payment[] }> {
    return this.request('GET', '/payments', { params });
  }

  async getPayment(id: string): Promise<{ payment: Payment }> {
    return this.request('GET', `/payments/${id}`);
  }

  async createPayment(data: Partial<Payment>): Promise<{ payment: Payment }> {
    return this.request('POST', '/payments', { body: data });
  }

  async recordPayment(id: string): Promise<{ payment: Payment }> {
    return this.request('POST', `/payments/${id}/record`);
  }

  async getMyPayments(params?: {
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Payment> & { payments: Payment[] }> {
    return this.request('GET', '/payments/mine', { params });
  }

  async getPaymentSummary(leaseId: string): Promise<{
    totalDue: number;
    totalPaid: number;
    overdueAmount: number;
    upcomingPayments: Payment[];
  }> {
    return this.request('GET', `/payments/summary/${leaseId}`);
  }

  // ===========================================================================
  // LEADS
  // ===========================================================================

  async getLeads(params?: {
    status?: string;
    listingId?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Lead> & { leads: Lead[] }> {
    return this.request('GET', '/leads', { params });
  }

  async getLead(id: string): Promise<{ lead: Lead }> {
    return this.request('GET', `/leads/${id}`);
  }

  async createLead(data: Partial<Lead>): Promise<{ lead: Lead }> {
    return this.request('POST', '/leads', { body: data });
  }

  async updateLead(id: string, data: Partial<Lead>): Promise<{ lead: Lead }> {
    return this.request('PATCH', `/leads/${id}`, { body: data });
  }

  // ===========================================================================
  // TOURS
  // ===========================================================================

  async getTours(params?: {
    status?: string;
    listingId?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Tour> & { tours: Tour[] }> {
    return this.request('GET', '/tours', { params });
  }

  async getTour(id: string): Promise<{ tour: Tour }> {
    return this.request('GET', `/tours/${id}`);
  }

  async scheduleTour(data: {
    listingId: string;
    leadId?: string;
    scheduledAt: string;
    duration?: number;
    notes?: string;
  }): Promise<{ tour: Tour }> {
    return this.request('POST', '/tours', { body: data });
  }

  async updateTour(id: string, data: Partial<Tour>): Promise<{ tour: Tour }> {
    return this.request('PATCH', `/tours/${id}`, { body: data });
  }

  async recordTourFeedback(id: string, feedback: string): Promise<{ tour: Tour }> {
    return this.request('POST', `/tours/${id}/feedback`, { body: { feedback } });
  }

  async getUpcomingTours(days?: number): Promise<{ tours: Tour[] }> {
    return this.request('GET', '/tours/upcoming', { params: { days } });
  }

  // ===========================================================================
  // NOTIFICATIONS
  // ===========================================================================

  async getNotifications(params?: {
    type?: string;
    read?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
    page: number;
    totalPages: number;
  }> {
    return this.request('GET', '/notifications', { params });
  }

  async markNotificationAsRead(id: string): Promise<{ notification: Notification }> {
    return this.request('POST', `/notifications/${id}/read`);
  }

  async markAllNotificationsAsRead(): Promise<{ count: number }> {
    return this.request('POST', '/notifications/read-all');
  }

  async deleteNotification(id: string): Promise<void> {
    return this.request('DELETE', `/notifications/${id}`);
  }

  // ===========================================================================
  // FEEDBACK
  // ===========================================================================

  async getFeedback(params?: {
    agentId?: string;
    category?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<AgentFeedback> & { feedback: AgentFeedback[] }> {
    return this.request('GET', '/feedback', { params });
  }

  async createFeedback(data: Partial<AgentFeedback>): Promise<{ feedback: AgentFeedback }> {
    return this.request('POST', '/feedback', { body: data });
  }

  async getAgentRatingSummary(agentId: string): Promise<{
    averageRating: number;
    totalReviews: number;
    categoryRatings: Record<string, number>;
    recentFeedback: AgentFeedback[];
  }> {
    return this.request('GET', `/feedback/agent/${agentId}/summary`);
  }
}

// =============================================================================
// ERROR CLASS
// =============================================================================

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const api = new ApiClient(API_BASE);

export default api;
