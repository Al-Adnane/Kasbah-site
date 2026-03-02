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

export interface ThreatDetection {
  id: string;
  timestamp: string;
  severity: 'WARN' | 'BLOCK' | 'DENY';
  pattern: string;
  user_id: string;
  source: string;
  content_hash: string;
  risk_score: number;
  action_taken: string;
}

export interface DeploymentStatusData {
  total_devices: number;
  deployed_devices: number;
  rollout_percentage: number;
  platforms: {
    windows: { total: number; deployed: number };
    macos: { total: number; deployed: number };
    chromebook: { total: number; deployed: number };
  };
  last_sync: string;
  rollback_available: boolean;
}

export interface QuickStatsData {
  period: '24h' | '7d' | '30d';
  total_detections: number;
  blocked_count: number;
  exemption_count: number;
  active_users: number;
  trend_data: { timestamp: string; count: number }[];
}

export interface Escalation {
  id: string;
  timestamp: string;
  detection_id: string;
  risk_score: number;
  rule_triggered: string;
  assigned_to: string;
  status: 'open' | 'in_progress' | 'resolved';
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user_id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  result: 'success' | 'failure';
  details: Record<string, any>;
  ip_address: string;
  signature: string;
  signature_valid: boolean;
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

  // ===== Admin Dashboard =====

  async getAdminThreats(period: '24h' | '7d' | '30d' = '24h'): Promise<ThreatDetection[]> {
    try {
      const response = await this.client.get<any>('/api/admin/dashboard/threats', {
        params: { period },
      });
      return response.data.threats || [];
    } catch (error) {
      console.error('Failed to fetch threat data:', error);
      return [];
    }
  }

  async getAdminStats(period: '24h' | '7d' | '30d' = '24h'): Promise<QuickStatsData | null> {
    try {
      const response = await this.client.get<any>('/api/admin/dashboard/stats', {
        params: { period },
      });
      return response.data.stats || null;
    } catch (error) {
      console.error('Failed to fetch admin stats:', error);
      return null;
    }
  }

  async getDeploymentStatus(): Promise<DeploymentStatusData | null> {
    try {
      const response = await this.client.get<any>('/api/admin/dashboard/deployment-status');
      return response.data.deployment || null;
    } catch (error) {
      console.error('Failed to fetch deployment status:', error);
      return null;
    }
  }

  async getAdminEscalations(limit: number = 10): Promise<Escalation[]> {
    try {
      const response = await this.client.get<any>('/api/admin/dashboard/escalations', {
        params: { limit },
      });
      return response.data.escalations || [];
    } catch (error) {
      console.error('Failed to fetch escalations:', error);
      return [];
    }
  }

  // ===== Audit Logs =====

  async getAuditLogs(limit: number = 100, offset: number = 0): Promise<AuditLogEntry[]> {
    try {
      const response = await this.client.get<any>('/api/admin/org/audit-logs', {
        params: { limit, offset },
      });
      return response.data.logs || [];
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      return [];
    }
  }

  async verifyAuditLogSignature(logId: string): Promise<boolean> {
    try {
      const response = await this.client.get<any>(`/api/admin/org/audit-logs/${logId}/verify`);
      return response.data.valid === true;
    } catch (error) {
      console.error('Failed to verify log signature:', error);
      return false;
    }
  }

  async exportAuditLogs(format: 'csv' | 'json' = 'csv'): Promise<Blob | null> {
    try {
      const response = await this.client.post<any>('/api/admin/org/audit-logs/export', { format });
      return response.data || null;
    } catch (error) {
      console.error('Failed to export audit logs:', error);
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
