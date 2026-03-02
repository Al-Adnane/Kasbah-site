/**
 * Kasbah Guard — Policy Engine Service v1.0.0
 *
 * Core policy evaluation logic for enterprise deployments
 * Applies org policies to detection results in order:
 * 1. Load org policies (global + department-level)
 * 2. Check user exemption
 * 3. Apply global threshold
 * 4. Apply department override
 * 5. Evaluate escalation rules
 * 6. Return final verdict + actions
 */

class PolicyEngine {
  constructor(env) {
    this.env = env;
    this.policyCache = new Map(); // Cache org policies for performance
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Main entry point: Apply policies to a detection
   *
   * @param {Object} detection - Detection result { risk_score, pattern, detected_content_hash }
   * @param {string} org_id - Organization ID
   * @param {string} user_id - User ID
   * @param {string} dept_id - Department ID (optional)
   * @returns {Object} Decision { verdict, risk_score, actions, reason }
   */
  async applyPolicies(detection, org_id, user_id, dept_id) {
    // Step 1: Load organization policies
    const policies = await this.loadOrgPolicies(org_id);
    if (!policies) {
      return this.createDecision('WARN', detection.risk_score, 'No policies loaded', []);
    }

    let verdict = 'ALLOW';
    let finalRiskScore = detection.risk_score;
    const actions = [];
    const reason = [];

    // Step 2: Check user exemption (highest priority - overrides all)
    const isExempt = await this.isUserExempt(org_id, user_id);
    if (isExempt) {
      reason.push('User is exempted from risk scoring');
      return this.createDecision('ALLOW', finalRiskScore, reason.join('; '), actions, { exempted: true });
    }

    // Step 3: Apply global threshold
    if (finalRiskScore >= policies.deny_threshold) {
      verdict = 'DENY';
      reason.push(`Risk score ${finalRiskScore}% exceeds DENY threshold ${policies.deny_threshold}%`);
      actions.push('block_transmission');
    } else if (finalRiskScore >= policies.block_threshold) {
      verdict = 'BLOCK';
      reason.push(`Risk score ${finalRiskScore}% exceeds BLOCK threshold ${policies.block_threshold}%`);
      actions.push('flag_for_review');
    } else if (finalRiskScore >= policies.warn_threshold) {
      verdict = 'WARN';
      reason.push(`Risk score ${finalRiskScore}% exceeds WARN threshold ${policies.warn_threshold}%`);
      actions.push('notify_user');
    }

    // Step 4: Apply department override (may reduce verdict severity)
    if (dept_id && policies.departments[dept_id]) {
      const deptPolicy = policies.departments[dept_id];
      if (deptPolicy.enabled) {
        const deptThreshold = deptPolicy.threshold || policies.block_threshold;
        if (finalRiskScore < deptThreshold && verdict !== 'ALLOW') {
          // Department exception allows higher threshold
          verdict = 'WARN';
          reason.push(`Department ${dept_id} exception: threshold ${deptThreshold}% applied`);
        }
      }
    }

    // Step 5: Check escalation rules
    if (finalRiskScore >= policies.escalation_threshold) {
      await this.triggerEscalation(org_id, detection, user_id, dept_id);
      actions.push('escalate_to_soc');
      reason.push(`Risk score exceeds escalation threshold ${policies.escalation_threshold}%`);
    }

    // Step 6: Log decision to audit trail
    await this.logPolicyDecision(org_id, user_id, detection, verdict, reason);

    return this.createDecision(verdict, finalRiskScore, reason.join('; '), actions);
  }

  /**
   * Load organization policies from storage (with caching)
   */
  async loadOrgPolicies(org_id) {
    // Check cache first
    const cached = this.policyCache.get(org_id);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    try {
      const key = `org:${org_id}:policies`;
      const data = await this.env.POLICIES.get(key);

      if (!data) {
        // Return default policies if none configured
        return this.getDefaultPolicies();
      }

      const policies = JSON.parse(data);

      // Cache it
      this.policyCache.set(org_id, {
        data: policies,
        timestamp: Date.now(),
      });

      return policies;
    } catch (error) {
      console.error(`Failed to load policies for org ${org_id}:`, error);
      return this.getDefaultPolicies();
    }
  }

  /**
   * Check if user is exempted from detection policies
   */
  async isUserExempt(org_id, user_id) {
    try {
      const key = `org:${org_id}:exemptions:${user_id}`;
      const data = await this.env.EXEMPTIONS.get(key);

      if (!data) return false;

      const exemption = JSON.parse(data);

      // Check expiration
      if (exemption.expires_at) {
        if (new Date(exemption.expires_at) < new Date()) {
          // Exemption expired
          await this.env.EXEMPTIONS.delete(key);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error(`Failed to check exemption for user ${user_id}:`, error);
      return false;
    }
  }

  /**
   * Trigger escalation workflow for high-risk detections
   */
  async triggerEscalation(org_id, detection, user_id, dept_id) {
    try {
      const escalation = {
        id: `esc-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        timestamp: new Date().toISOString(),
        detection_id: detection.id,
        org_id: org_id,
        user_id: user_id,
        dept_id: dept_id,
        risk_score: detection.risk_score,
        pattern: detection.pattern,
        status: 'open',
        assigned_to: await this.getOnCallAnalyst(org_id, dept_id),
      };

      const key = `escalations:${org_id}:${Date.now()}`;
      await this.env.ESCALATIONS.put(key, JSON.stringify(escalation), {
        expirationTtl: 2592000, // 30 days
      });

      // Notify via webhooks
      await this.notifyEscalation(org_id, escalation);

      return escalation;
    } catch (error) {
      console.error('Failed to trigger escalation:', error);
    }
  }

  /**
   * Send escalation notifications (email, Slack, webhook)
   */
  async notifyEscalation(org_id, escalation) {
    try {
      const key = `org:${org_id}:escalation-rules`;
      const data = await this.env.ESCALATION_RULES.get(key);

      if (!data) return;

      const rules = JSON.parse(data);

      // Send notifications per configured channel
      for (const rule of rules) {
        if (!rule.enabled) continue;

        for (const channel of rule.channels || []) {
          if (!channel.enabled) continue;

          if (channel.type === 'email') {
            // TODO: Send email via Mailgun/SendGrid
            console.log(`[ESCALATION] Email to ${channel.recipient}: Risk ${escalation.risk_score}%`);
          } else if (channel.type === 'slack') {
            // TODO: Send Slack message
            console.log(`[ESCALATION] Slack to ${channel.recipient}: Risk ${escalation.risk_score}%`);
          } else if (channel.type === 'webhook') {
            // POST to webhook URL
            await this.postWebhook(channel.recipient, escalation);
          }
        }
      }
    } catch (error) {
      console.error('Failed to send escalation notifications:', error);
    }
  }

  /**
   * POST escalation to external webhook
   */
  async postWebhook(webhookUrl, escalation) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'escalation',
          escalation: escalation,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.warn(`Webhook ${webhookUrl} returned ${response.status}`);
      }
    } catch (error) {
      console.error(`Failed to post webhook: ${error.message}`);
    }
  }

  /**
   * Get on-call analyst for assignment
   */
  async getOnCallAnalyst(org_id, dept_id) {
    try {
      const key = `org:${org_id}:on-call:${dept_id || 'default'}`;
      const data = await this.env.ON_CALL.get(key);

      if (data) {
        const oncall = JSON.parse(data);
        return oncall.analyst_id;
      }

      // Fallback to first admin
      return 'admin@company.com';
    } catch (error) {
      return 'admin@company.com';
    }
  }

  /**
   * Log policy decision to audit trail
   */
  async logPolicyDecision(org_id, user_id, detection, verdict, reason) {
    try {
      const key = `audit:${org_id}:${Date.now()}`;
      const logEntry = {
        timestamp: new Date().toISOString(),
        user_id: user_id,
        action: 'policy_applied',
        resource_type: 'detection',
        resource_id: detection.id,
        verdict: verdict,
        risk_score: detection.risk_score,
        pattern: detection.pattern,
        reason: reason,
      };

      await this.env.AUDIT_LOGS.put(key, JSON.stringify(logEntry), {
        expirationTtl: 7776000, // 90 days
      });
    } catch (error) {
      console.error('Failed to log policy decision:', error);
    }
  }

  /**
   * Create decision object
   */
  createDecision(verdict, riskScore, reason, actions, metadata = {}) {
    return {
      verdict: verdict, // ALLOW, WARN, BLOCK, DENY
      risk_score: riskScore,
      reason: reason,
      actions: actions,
      timestamp: new Date().toISOString(),
      ...metadata,
    };
  }

  /**
   * Get default policies for new organizations
   */
  getDefaultPolicies() {
    return {
      org_id: 'default',
      warn_threshold: 40,
      block_threshold: 70,
      deny_threshold: 90,
      escalation_threshold: 85,
      departments: {
        // dept_id: { threshold, enabled }
      },
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Update organization policies
   */
  async updateOrgPolicies(org_id, updates) {
    try {
      const policies = await this.loadOrgPolicies(org_id);
      const updated = { ...policies, ...updates, updated_at: new Date().toISOString() };

      const key = `org:${org_id}:policies`;
      await this.env.POLICIES.put(key, JSON.stringify(updated));

      // Invalidate cache
      this.policyCache.delete(org_id);

      return updated;
    } catch (error) {
      console.error('Failed to update policies:', error);
      throw error;
    }
  }

  /**
   * Add department-level policy override
   */
  async addDepartmentPolicy(org_id, dept_id, threshold, enabled = true) {
    try {
      const policies = await this.loadOrgPolicies(org_id);

      policies.departments[dept_id] = {
        threshold: threshold,
        enabled: enabled,
        created_at: new Date().toISOString(),
      };

      return this.updateOrgPolicies(org_id, policies);
    } catch (error) {
      console.error('Failed to add department policy:', error);
      throw error;
    }
  }

  /**
   * Add user exemption
   */
  async addUserExemption(org_id, user_id, reason, expiresAt = null) {
    try {
      const exemption = {
        user_id: user_id,
        reason: reason,
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
      };

      const key = `org:${org_id}:exemptions:${user_id}`;
      const ttl = expiresAt
        ? Math.floor((new Date(expiresAt) - Date.now()) / 1000)
        : undefined;

      await this.env.EXEMPTIONS.put(key, JSON.stringify(exemption), {
        expirationTtl: ttl,
      });

      return exemption;
    } catch (error) {
      console.error('Failed to add exemption:', error);
      throw error;
    }
  }

  /**
   * Remove user exemption
   */
  async removeUserExemption(org_id, user_id) {
    try {
      const key = `org:${org_id}:exemptions:${user_id}`;
      await this.env.EXEMPTIONS.delete(key);
      return true;
    } catch (error) {
      console.error('Failed to remove exemption:', error);
      return false;
    }
  }
}

module.exports = { PolicyEngine };
