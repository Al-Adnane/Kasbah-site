/**
 * Kasbah Guard Enterprise API Client v1.0.0
 *
 * Provides typed methods for interacting with the Kasbah API
 */

import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.bekasbah.com';

interface ApiErrorResponse {
  ok: false;
  error: string;
}

interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface Policy {
  id: string;
  name: string;
  description: string;
  patterns: string[];
  threshold: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  event_type: string;
  user_id: string;
  resource: string;
  action: string;
  result: string;
  risk_level: string;
  details: Record<string, any>;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
  created_at: string;
  last_seen: string;
}

export interface Stats {
  total_detections: number;
  total_policies: number;
  total_users: number;
  false_positive_rate: number;
  avg_response_time_ms: number;
}

class KasbahApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Load token from localStorage if available
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('kasbah_token');
      if (this.token) {
        this.setAuthToken(this.token);
      }
    }
  }

  setAuthToken(token: string) {
    this.token = token;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('kasbah_token', token);
  }

  clearAuthToken() {
    this.token = null;
    delete this.client.defaults.headers.common['Authorization'];
    localStorage.removeItem('kasbah_token');
  }

  // ===== Policies =====

  async getPolicies(): Promise<Policy[]> {
    try {
      const response = await this.client.get<any>('/api/policies');
      return response.data.policies || [];
    } catch (error) {
      console.error('Failed to fetch policies:', error);
      return [];
    }
  }

  async createPolicy(policy: Omit<Policy, 'id' | 'created_at' | 'updated_at'>): Promise<Policy | null> {
    try {
      const response = await this.client.post<any>('/api/policies', policy);
      return response.data.policy || null;
    } catch (error) {
      console.error('Failed to create policy:', error);
      return null;
    }
  }

  async updatePolicy(id: string, policy: Partial<Policy>): Promise<Policy | null> {
    try {
      const response = await this.client.put<any>(`/api/policies/${id}`, policy);
      return response.data.policy || null;
    } catch (error) {
      console.error('Failed to update policy:', error);
      return null;
    }
  }

  async deletePolicy(id: string): Promise<boolean> {
    try {
      await this.client.delete(`/api/policies/${id}`);
      return true;
    } catch (error) {
      console.error('Failed to delete policy:', error);
      return false;
    }
  }

  // ===== Audit Logs =====

  async getAuditLogs(limit = 100, offset = 0): Promise<AuditLog[]> {
    try {
      const response = await this.client.get<any>('/api/audit/recent', {
        params: { limit, offset },
      });
      return response.data.logs || [];
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      return [];
    }
  }

  // ===== Team Management =====

  async getTeamMembers(): Promise<TeamMember[]> {
    try {
      const response = await this.client.get<any>('/api/team');
      return response.data.members || [];
    } catch (error) {
      console.error('Failed to fetch team members:', error);
      return [];
    }
  }

  async addTeamMember(email: string, role: 'admin' | 'member' | 'viewer'): Promise<TeamMember | null> {
    try {
      const response = await this.client.post<any>('/api/team', { email, role });
      return response.data.member || null;
    } catch (error) {
      console.error('Failed to add team member:', error);
      return null;
    }
  }

  async updateTeamMember(id: string, role: 'admin' | 'member' | 'viewer'): Promise<TeamMember | null> {
    try {
      const response = await this.client.put<any>(`/api/team/${id}`, { role });
      return response.data.member || null;
    } catch (error) {
      console.error('Failed to update team member:', error);
      return null;
    }
  }

  async removeTeamMember(id: string): Promise<boolean> {
    try {
      await this.client.delete(`/api/team/${id}`);
      return true;
    } catch (error) {
      console.error('Failed to remove team member:', error);
      return false;
    }
  }

  // ===== Stats =====

  async getStats(): Promise<Stats | null> {
    try {
      const response = await this.client.get<any>('/api/stats');
      return response.data.stats || null;
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      return null;
    }
  }

  // ===== Health Check =====

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data.ok === true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}

export const apiClient = new KasbahApiClient();
export default apiClient;
