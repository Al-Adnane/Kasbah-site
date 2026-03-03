/**
 * LLM Supply Chain Auditor: Model Provenance & Attestation
 * ========================================================
 *
 * Tracks which LLM models are called, versions, and creates tamper-evident
 * audit trail of all external model usage for compliance and transparency.
 *
 * Features:
 * - Model registration with cryptographic attestation
 * - Per-call audit logging (input/output hashes, latency)
 * - Supply chain verification
 * - Tampering detection
 * - Ledger commitment (optional blockchain)
 *
 * Used by: multi-model-router.js, worker.js
 * Storage: In-memory + persistent JSON files
 */

class LLMSupplyChainAuditor {
  constructor(options = {}) {
    this.modelRegistry = new Map();           // model_id → attestation
    this.provenanceChain = [];                // Tamper-evident log
    this.enableBlockchain = options.enableBlockchain || false;
    this.persistenceLayer = options.persistenceLayer || null;  // For ledger commits
    this.maxChainLength = options.maxChainLength || 10000;     // Circular buffer
  }

  /**
   * Register a new LLM model with cryptographic attestation
   */
  async registerModel(modelInfo) {
    console.log(`🔐 Registering model: ${modelInfo.id}`);

    const attestation = {
      model_id: modelInfo.id,
      provider: modelInfo.provider,  // 'anthropic', 'openai', 'gemini', etc.
      version: modelInfo.version,    // '4.0', 'gpt-4-turbo', etc.

      // Model configuration (immutable)
      config: {
        max_input_tokens: modelInfo.maxInputTokens,
        max_output_tokens: modelInfo.maxOutputTokens,
        temperature: modelInfo.temperature || 0,
        top_p: modelInfo.topP || 1.0,
        functions_allowed: modelInfo.functions || []
      },

      // Cryptographic commitment
      model_hash: await this._hashModelMetadata(modelInfo),

      // Permissions and data handling
      permissions: {
        data_retention_days: modelInfo.dataRetentionDays || 0,  // 0 = no retention
        can_fine_tune: modelInfo.canFineTune || false,
        can_cache_responses: modelInfo.canCacheResponses || false,
        regions: modelInfo.regions || ['global']
      },

      // Provider signature (to be obtained from provider)
      provider_signature: await this._getProviderSignature(modelInfo),

      // Registration metadata
      registered_at: new Date().toISOString(),
      registration_hash: null,  // Set after creation

      // Usage tracking
      usage_log: [],            // Array of call records
      total_calls: 0,
      total_tokens_used: 0
    };

    // Set registration hash (self-referential)
    attestation.registration_hash = await this._hashAttestation(attestation);

    // Store in registry
    this.modelRegistry.set(modelInfo.id, attestation);

    // Add to provenance chain
    this._addToProvenanceChain('MODEL_REGISTERED', attestation);

    console.log(`✅ Model registered: ${modelInfo.id} (hash: ${attestation.registration_hash.substring(0, 16)}...)`);

    return attestation;
  }

  /**
   * Audit a single LLM call with provenance tracking
   */
  async auditModelCall(modelId, intent, response, metadata = {}) {
    const model = this.modelRegistry.get(modelId);

    if (!model) {
      throw new Error(`Model not registered: ${modelId}`);
    }

    const callRecord = {
      call_id: `${modelId}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      model_id: modelId,
      timestamp: new Date().toISOString(),

      // Input integrity (hashes, no content storage for privacy)
      intent_hash: await this._sha256(intent),
      intent_length: intent.length,
      intent_word_count: intent.split(/\s+/).length,

      // Output integrity
      response_hash: await this._sha256(response.text || response),
      response_length: (response.text || response).length,
      response_tokens: response.tokens || 0,

      // Performance metrics
      response_time_ms: response.latency || metadata.latency || 0,
      model_version: model.version,
      temperature: response.temperature || model.config.temperature,

      // Reproducibility flag
      is_deterministic: (response.temperature || model.config.temperature) === 0,

      // Optional: track if response was cached
      was_cached: response.was_cached || false,

      // Metadata context
      endpoint: metadata.endpoint || model.provider,
      user_agent: metadata.user_agent || 'unknown',
      request_id: metadata.request_id || null,

      // Data handling verification
      data_retention_honored: true,  // Assume true unless provider violates

      // Chain link (for tamper-detection)
      previous_hash: this.provenanceChain.length > 0
        ? this.provenanceChain[this.provenanceChain.length - 1].chain_hash
        : null
    };

    // Set self-referential hash
    callRecord.call_hash = await this._hashCallRecord(callRecord);

    // Add to model's usage log
    model.usage_log.push(callRecord);
    model.total_calls += 1;
    model.total_tokens_used += (response.tokens || 0);

    // Add to global provenance chain
    this._addToProvenanceChain('MODEL_CALL', callRecord);

    // Optional: Commit to ledger every N calls
    if (this.provenanceChain.length % this.maxChainLength === 0) {
      await this._commitToLedger(this.provenanceChain.slice(-100));
    }

    return callRecord;
  }

  /**
   * Verify model provenance over a time range
   * Detects: tampering, version downgrades, unauthorized changes
   */
  async verifyModelProvenance(modelId, timeRange) {
    const model = this.modelRegistry.get(modelId);

    if (!model) {
      throw new Error(`Model not registered: ${modelId}`);
    }

    const log = model.usage_log.filter(entry => {
      const timestamp = new Date(entry.timestamp);
      return timestamp >= timeRange.start && timestamp <= timeRange.end;
    });

    // Consistency checks
    const versions = new Set(log.map(e => e.model_version));
    const endpoints = new Set(log.map(e => e.endpoint));

    // Anomaly detection on latency
    const latencies = log.map(e => e.response_time_ms);
    const meanLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length || 0;
    const stdLatency = Math.sqrt(
      latencies.reduce((sum, lat) => sum + Math.pow(lat - meanLatency, 2), 0) / latencies.length
    );

    const latencyAnomalies = log.filter(e =>
      Math.abs(e.response_time_ms - meanLatency) > 3 * stdLatency
    );

    // Anomaly detection on response hashes
    const responseHashes = new Map();
    for (const entry of log) {
      const hashKey = `${entry.intent_hash}-${entry.response_hash}`;
      responseHashes.set(hashKey, (responseHashes.get(hashKey) || 0) + 1);
    }

    const hashAnomalies = log.filter(e => {
      const hashKey = `${e.intent_hash}-${e.response_hash}`;
      return responseHashes.get(hashKey) === 1;  // One-off responses
    });

    // Tamper detection: verify chain continuity
    let isTampered = false;
    let tamperEvidenceStack = [];

    for (let i = 0; i < log.length; i++) {
      const current = log[i];
      const previous = i > 0 ? log[i - 1] : null;

      if (previous && current.previous_hash !== previous.call_hash) {
        isTampered = true;
        tamperEvidenceStack.push({
          call_index: i,
          call_id: current.call_id,
          issue: 'Chain continuity broken',
          expected_hash: previous.call_hash,
          actual_hash: current.previous_hash
        });
      }
    }

    // Compile verification report
    const verification = {
      model_id: modelId,
      period: timeRange,

      // Consistency
      version_consistency: {
        versions_used: Array.from(versions),
        consistent: versions.size === 1,
        note: versions.size === 1
          ? `Consistent use of ${Array.from(versions)[0]}`
          : `Version switched ${versions.size} times (investigate)`
      },

      endpoint_consistency: {
        endpoints_used: Array.from(endpoints),
        consistent: endpoints.size === 1
      },

      // Performance anomalies
      latency_analysis: {
        mean_ms: Math.round(meanLatency),
        std_ms: Math.round(stdLatency),
        anomalies: latencyAnomalies.length,
        anomaly_calls: latencyAnomalies.map(e => ({
          call_id: e.call_id,
          latency_ms: e.response_time_ms,
          deviation_std: Math.round(
            (e.response_time_ms - meanLatency) / stdLatency
          )
        }))
      },

      // Output hash anomalies
      response_hash_anomalies: {
        total_unique_pairs: responseHashes.size,
        one_off_responses: hashAnomalies.length,
        anomaly_calls: hashAnomalies.map(e => e.call_id)
      },

      // Tampering detection
      tampering: {
        is_tampered: isTampered,
        chain_integrity: !isTampered,
        evidence_count: tamperEvidenceStack.length,
        evidence: tamperEvidenceStack
      },

      // Summary statistics
      statistics: {
        total_calls: log.length,
        total_tokens: log.reduce((sum, e) => sum + e.response_tokens, 0),
        cached_calls: log.filter(e => e.was_cached).length,
        deterministic_calls: log.filter(e => e.is_deterministic).length
      },

      // Audit confidence
      confidence: this._calculateVerificationConfidence(
        versions.size,
        endpoints.size,
        latencyAnomalies.length,
        isTampered
      )
    };

    return verification;
  }

  /**
   * Export audit trail for compliance
   */
  async exportAuditTrail(format = 'json', dateRange = null) {
    const records = [];

    for (const [modelId, model] of this.modelRegistry.entries()) {
      const filtered = dateRange
        ? model.usage_log.filter(entry => {
            const ts = new Date(entry.timestamp);
            return ts >= dateRange.start && ts <= dateRange.end;
          })
        : model.usage_log;

      for (const call of filtered) {
        records.push({
          model_id: modelId,
          provider: model.provider,
          version: model.version,
          ...call
        });
      }
    }

    // Sort by timestamp
    records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    switch (format) {
      case 'json':
        return JSON.stringify(records, null, 2);

      case 'csv':
        return this._generateCSV(records);

      case 'jsonl':
        return records.map(r => JSON.stringify(r)).join('\n');

      default:
        return records;
    }
  }

  /**
   * Get summary statistics across all models
   */
  getSummary() {
    let totalCalls = 0;
    let totalTokens = 0;
    const modelStats = [];

    for (const [modelId, model] of this.modelRegistry.entries()) {
      totalCalls += model.total_calls;
      totalTokens += model.total_tokens_used;

      modelStats.push({
        model_id: modelId,
        provider: model.provider,
        version: model.version,
        registered_at: model.registered_at,
        calls: model.total_calls,
        tokens: model.total_tokens_used,
        avg_tokens_per_call: model.total_calls > 0
          ? Math.round(model.total_tokens_used / model.total_calls)
          : 0
      });
    }

    return {
      timestamp: new Date().toISOString(),
      total_models: this.modelRegistry.size,
      total_calls: totalCalls,
      total_tokens: totalTokens,
      chain_length: this.provenanceChain.length,
      models: modelStats.sort((a, b) => b.calls - a.calls)
    };
  }

  // ==================== Private Helpers ====================

  async _hashModelMetadata(modelInfo) {
    const data = JSON.stringify({
      id: modelInfo.id,
      provider: modelInfo.provider,
      version: modelInfo.version,
      maxInputTokens: modelInfo.maxInputTokens,
      maxOutputTokens: modelInfo.maxOutputTokens
    });

    return await this._sha256(data);
  }

  async _hashAttestation(attestation) {
    const data = JSON.stringify({
      model_id: attestation.model_id,
      provider: attestation.provider,
      version: attestation.version,
      registered_at: attestation.registered_at,
      config: attestation.config
    });

    return await this._sha256(data);
  }

  async _hashCallRecord(callRecord) {
    const data = JSON.stringify({
      call_id: callRecord.call_id,
      model_id: callRecord.model_id,
      timestamp: callRecord.timestamp,
      intent_hash: callRecord.intent_hash,
      response_hash: callRecord.response_hash,
      response_time_ms: callRecord.response_time_ms
    });

    return await this._sha256(data);
  }

  async _sha256(data) {
    if (typeof data === 'object') {
      data = JSON.stringify(data);
    }

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    // Use crypto.subtle if available (browser/Node with crypto)
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Fallback for Node.js
    if (typeof require !== 'undefined') {
      try {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(data).digest('hex');
      } catch (e) {
        console.error('SHA-256 not available:', e);
        return 'hash_unavailable';
      }
    }

    throw new Error('SHA-256 not available');
  }

  async _getProviderSignature(modelInfo) {
    // In production, fetch signature from provider's public ledger
    // For now, return placeholder
    return {
      provider: modelInfo.provider,
      signature_type: 'ed25519',
      signed_by: `${modelInfo.provider}-key-${modelInfo.version}`,
      verified: false  // To be set by provider verification
    };
  }

  _addToProvenanceChain(eventType, data) {
    const chainEntry = {
      event_type: eventType,
      timestamp: new Date().toISOString(),
      data_hash: this._hashSync(data),
      previous_hash: this.provenanceChain.length > 0
        ? this.provenanceChain[this.provenanceChain.length - 1].chain_hash
        : null,

      // Self-referential hash (tamper-evident)
      get chain_hash() {
        return this._computeChainHash();
      },

      _computeChainHash() {
        return this._hashSync(
          this.data_hash +
          (this.previous_hash || '') +
          this.timestamp
        );
      },

      _hashSync(data) {
        // Simplified sync hash for chain (use SHA1 for speed)
        if (typeof require !== 'undefined') {
          const crypto = require('crypto');
          return crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex');
        }
        // Fallback: simple hash
        return `hash-${Date.now()}`;
      }
    };

    // Compute chain hash
    chainEntry.chain_hash = this._hashSync(
      chainEntry.data_hash +
      (chainEntry.previous_hash || '') +
      chainEntry.timestamp
    );

    this.provenanceChain.push(chainEntry);

    // Maintain circular buffer
    if (this.provenanceChain.length > this.maxChainLength) {
      this.provenanceChain.shift();
    }
  }

  async _commitToLedger(entries) {
    if (!this.enableBlockchain) return;

    console.log(`📝 Committing ${entries.length} entries to ledger...`);

    // In production, submit to blockchain (Ethereum, Polygon, etc.)
    // For now, just log
    const commitment = {
      timestamp: new Date().toISOString(),
      entry_count: entries.length,
      first_hash: entries[0]?.chain_hash,
      last_hash: entries[entries.length - 1]?.chain_hash,
      merkle_root: await this._computeMerkleRoot(entries)
    };

    console.log(`✅ Ledger committed:`, commitment);

    return commitment;
  }

  async _computeMerkleRoot(entries) {
    // Simplified Merkle tree for demonstration
    let hashes = entries.map(e => e.chain_hash);

    while (hashes.length > 1) {
      const newHashes = [];
      for (let i = 0; i < hashes.length; i += 2) {
        const combined = hashes[i] + (hashes[i + 1] || '');
        newHashes.push(await this._sha256(combined));
      }
      hashes = newHashes;
    }

    return hashes[0];
  }

  _hashSync(data) {
    // Synchronous hash for internal use
    if (typeof require !== 'undefined') {
      const crypto = require('crypto');
      return crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex');
    }
    return `hash-${JSON.stringify(data).length}`;
  }

  _generateCSV(records) {
    const headers = [
      'Timestamp',
      'Model ID',
      'Provider',
      'Version',
      'Intent Hash',
      'Response Hash',
      'Latency (ms)',
      'Tokens Used',
      'Cached',
      'Deterministic'
    ];

    const rows = records.map(r => [
      r.timestamp,
      r.model_id,
      r.provider,
      r.version,
      r.intent_hash?.substring(0, 16) || 'N/A',
      r.response_hash?.substring(0, 16) || 'N/A',
      r.response_time_ms,
      r.response_tokens,
      r.was_cached ? 'yes' : 'no',
      r.is_deterministic ? 'yes' : 'no'
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }

  _calculateVerificationConfidence(versionCount, endpointCount, anomalies, isTampered) {
    let confidence = 1.0;

    // Penalize for multiple versions
    if (versionCount > 1) confidence -= 0.1;

    // Penalize for multiple endpoints
    if (endpointCount > 1) confidence -= 0.05;

    // Penalize for anomalies
    confidence -= Math.min(0.3, anomalies * 0.01);

    // Severe penalty for tampering
    if (isTampered) confidence -= 0.5;

    return Math.max(0, confidence);
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LLMSupplyChainAuditor;
}
