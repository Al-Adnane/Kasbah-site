'use client';

import { useEffect, useState } from 'react';
import { apiClient, Stats } from '@/lib/api';

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await apiClient.getStats();
        setStats(data);
      } catch (error) {
        console.error('Failed to load stats:', error);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  return (
    <div className="dashboard">
      <h1>Dashboard Overview</h1>

      {loading ? (
        <p>Loading stats...</p>
      ) : stats ? (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Detections</h3>
            <p className="stat-value">{stats.total_detections.toLocaleString()}</p>
          </div>

          <div className="stat-card">
            <h3>Active Policies</h3>
            <p className="stat-value">{stats.total_policies}</p>
          </div>

          <div className="stat-card">
            <h3>Team Members</h3>
            <p className="stat-value">{stats.total_users}</p>
          </div>

          <div className="stat-card">
            <h3>False Positive Rate</h3>
            <p className="stat-value">{(stats.false_positive_rate * 100).toFixed(1)}%</p>
          </div>

          <div className="stat-card">
            <h3>Avg Response Time</h3>
            <p className="stat-value">{stats.avg_response_time_ms.toFixed(2)}ms</p>
          </div>
        </div>
      ) : (
        <p>Error loading stats. Check API connection.</p>
      )}

      <section className="getting-started">
        <h2>Getting Started</h2>
        <ul>
          <li>
            <a href="/policies">Manage Detection Policies</a> — Define custom detection rules
          </li>
          <li>
            <a href="/audit">View Audit Logs</a> — Track all detections and team activities
          </li>
          <li>
            <a href="/team">Manage Team</a> — Add members and assign roles
          </li>
          <li>
            <a href="/ecosystem">View Ecosystem</a> — See all 22 PPP modules in action
          </li>
        </ul>
      </section>
    </div>
  );
}
