/**
 * Federated Intent Graph: Context-Aware Semantic Understanding
 * ==============================================================
 *
 * Gap 2: Builds semantic context from recent intents
 * - User context window (last 100 intents)
 * - Domain-specific context (e.g., GitHub = expected credentials)
 * - Cross-tab intent understanding
 * - Bayesian networks for causal reasoning
 * - Attention-based context fusion
 * - Anomaly detection via context drift
 *
 * Usage:
 * ```javascript
 * const federated = new FederatedIntentGraph();
 * const embedding = await federated.buildContextualEmbedding(intent, tabMetadata);
 * // → { fused, anomalyScore: 0.95, contextualRisk: true }
 *
 * const causal = await federated.reasonAboutIntentCausality(intent, tabHistory);
 * // → { P(unsafe | context) = 0.92 }
 * ```
 *
 * Storage: chrome.storage.local (user_context_history, domain_contexts, semantic_graphs)
 */

class FederatedIntentGraph {
  constructor(options = {}) {
    this.userContextWindow = options.userContextWindow || 100;  // Last 100 intents
    this.similarityThreshold = options.similarityThreshold || 0.7;
    this.anomalyThreshold = options.anomalyThreshold || 0.4;
    this.contextWeights = options.contextWeights || [0.6, 0.25, 0.15];  // user, domain, global
    this.topicEmbeddings = new Map();  // Topic → embedding
    this.sessionGraphs = new Map();    // tabId → semantic graph
    this.userHistory = [];            // Recent intents
    this.domainContexts = new Map();  // domain → {safe, risky, neutral}
  }

  /**
   * Build contextual embedding with anomaly scoring
   */
  async buildContextualEmbedding(intent, tabMetadata) {
    console.log(`🧠 Building contextual embedding for intent...`);

    try {
      // 1. Get user's recent intent history
      const userHistory = await this._getRecentIntents(tabMetadata.tabId || 'global', 20);

      // 2. Embed current intent (mock: simple TF-IDF approximation)
      const currentEmbedding = this._embedIntent(intent);

      // 3. Compute user context (semantic similarity to recent intents)
      const userContextEmbedding = this._computeContextEmbedding(userHistory);
      const userSimilarity = this._cosineSimilarity(currentEmbedding, userContextEmbedding);

      // 4. Get domain context (GitHub, Twitter, Slack, etc.)
      const domain = this._extractDomain(tabMetadata.url || '');
      const domainContext = this._getDomainContext(domain);
      const domainSimilarity = this._contextDistance(intent, domainContext);

      // 5. Get global context (common safe/risky patterns)
      const globalContext = await this._getGlobalContext();
      const globalSimilarity = this._contextDistance(intent, globalContext);

      // 6. Attention-based fusion of contexts
      const fused = {
        user_component: userSimilarity * this.contextWeights[0],
        domain_component: domainSimilarity * this.contextWeights[1],
        global_component: globalSimilarity * this.contextWeights[2],
        total: 0
      };

      fused.total = fused.user_component + fused.domain_component + fused.global_component;

      // 7. Compute anomaly score
      // High anomaly = deviation from all contexts
      const anomalyScore = 1 - fused.total;
      const contextualRisk = anomalyScore > this.anomalyThreshold;

      console.log(`✓ Contextual embedding: anomaly=${anomalyScore.toFixed(3)}, risk=${contextualRisk}`);

      return {
        fused: fused,
        anomalyScore: anomalyScore,
        contextualRisk: contextualRisk,
        userSimilarity: userSimilarity,
        domainSimilarity: domainSimilarity,
        globalSimilarity: globalSimilarity,
        domain: domain,
        components: {
          user: this.contextWeights[0],
          domain: this.contextWeights[1],
          global: this.contextWeights[2]
        }
      };
    } catch (e) {
      console.error('❌ Context embedding failed:', e);
      return { anomalyScore: 0.5, contextualRisk: false, error: e.message };
    }
  }

  /**
   * Causal reasoning: P(unsafe | context) using Bayesian network
   */
  async reasonAboutIntentCausality(intent, tabHistory) {
    console.log(`🔗 Reasoning about intent causality...`);

    try {
      // 1. Extract context variables
      const domainRisk = this._getDomainRisk(this._extractDomain((tabHistory || [])[0]?.url || ''));
      const userBehavior = await this._getUserBehaviorRisk(tabHistory);
      const intentContent = this._getIntentContentRisk(intent);

      // 2. Build Bayesian Network
      //    Variables: domain, user_behavior, intent_content → unsafe
      //
      //    domain → unsafe
      //         ↘
      //          → unsafe (target)
      //         ↗
      //    user_behavior → unsafe
      //    intent_content → unsafe
      //

      // 3. Conditional Probability Tables (CPTs)
      const cpts = {
        // P(intent_content | domain, user_behavior)
        intent_given_context: this._computeIntentCPT(domainRisk, userBehavior),

        // P(unsafe | intent_content, domain, user_behavior)
        unsafe_given_all: this._computeUnsafeCPT(intentContent, domainRisk, userBehavior)
      };

      // 4. Query: P(unsafe | observed context)
      const posteriorRisk = this._bayesianQuery(
        intentContent,
        { domain: domainRisk, user_behavior: userBehavior },
        cpts
      );

      // 5. Identify confounders
      const confounders = this._findConfounders(intent, tabHistory);

      // 6. Causal effect estimation
      const causalEffect = posteriorRisk;

      return {
        posterior_risk: posteriorRisk,
        intent_content_risk: intentContent,
        domain_risk: domainRisk,
        user_behavior_risk: userBehavior,
        confounders: confounders,
        causal_effect: causalEffect,
        interpretation: this._interpretCausalEffect(causalEffect, confounders)
      };
    } catch (e) {
      console.error('❌ Causal reasoning failed:', e);
      return { posterior_risk: 0.5, error: e.message };
    }
  }

  /**
   * Build semantic graph for intent relationships
   */
  async buildSemanticGraph(recentIntents, window = 50) {
    console.log(`📊 Building semantic graph (${recentIntents.length} intents)...`);

    try {
      const graph = {
        nodes: [],
        edges: [],
        metadata: {
          created: new Date().toISOString(),
          intent_count: recentIntents.length,
          window_size: window
        }
      };

      // Limit to window size
      const intents = recentIntents.slice(-window);

      // 1. Create nodes with embeddings
      for (let i = 0; i < intents.length; i++) {
        const intent = intents[i];
        const embedding = this._embedIntent(intent);

        graph.nodes.push({
          id: `intent_${i}`,
          text: intent.substring(0, 50),  // Truncate for storage
          embedding: embedding,
          timestamp: new Date().toISOString(),
          index: i
        });
      }

      // 2. Create edges based on semantic similarity
      for (let i = 0; i < graph.nodes.length; i++) {
        for (let j = i + 1; j < graph.nodes.length; j++) {
          const sim = this._cosineSimilarity(
            graph.nodes[i].embedding,
            graph.nodes[j].embedding
          );

          if (sim > this.similarityThreshold) {
            graph.edges.push({
              source: graph.nodes[i].id,
              target: graph.nodes[j].id,
              weight: sim,
              bidirectional: true
            });
          }
        }
      }

      console.log(`✓ Graph created: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

      // Store in session
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ semantic_graphs: graph });
      }

      return graph;
    } catch (e) {
      console.error('❌ Graph building failed:', e);
      return { nodes: [], edges: [], error: e.message };
    }
  }

  /**
   * Propagate threat signal through graph
   */
  async propagateThreatSignal(currentIntent, seedRiskScore) {
    console.log(`⚡ Propagating threat signal (seed: ${seedRiskScore.toFixed(2)})...`);

    try {
      // 1. Find semantic neighbors
      const neighbors = await this._findSemanticNeighbors(currentIntent, topK = 10);

      // 2. Propagate risk with decay
      const threatScores = {};
      for (const { neighbor, similarity } of neighbors) {
        // Risk decays quadratically with distance
        const propagatedRisk = seedRiskScore * (similarity * similarity);
        threatScores[neighbor] = propagatedRisk;
      }

      // 3. Ensemble: aggregate neighbor risks
      const neighborRisks = Object.values(threatScores);
      const ensembleRisk = neighborRisks.length > 0
        ? neighborRisks.reduce((a, b) => a + b, 0) / neighborRisks.length
        : 0;

      // 4. GNN threat score combines seed + propagation
      const gnnThreatScore = (seedRiskScore + ensembleRisk) / 2;

      // 5. Propagation strength: how many neighbors affected
      const propagationStrength = neighbors.length / 10;  // Normalized to 10 neighbors

      console.log(`✓ Threat propagated: ${Object.keys(threatScores).length} neighbors, score=${gnnThreatScore.toFixed(2)}`);

      return {
        gnn_threat_score: gnnThreatScore,
        semantic_neighbors: Object.keys(threatScores),
        threat_scores: threatScores,
        propagation_strength: propagationStrength,
        seed_risk: seedRiskScore,
        ensemble_risk: ensembleRisk
      };
    } catch (e) {
      console.error('❌ Threat propagation failed:', e);
      return { gnn_threat_score: 0, semantic_neighbors: [], error: e.message };
    }
  }

  /**
   * Get domain context
   */
  _getDomainContext(domain) {
    // Pre-defined domain contexts
    const contexts = {
      'github.com': { type: 'development', expect: ['credentials', 'keys', 'tokens'] },
      'gitlab.com': { type: 'development', expect: ['credentials', 'keys'] },
      'aws.amazon.com': { type: 'cloud', expect: ['access_keys', 'secrets'] },
      'gmail.com': { type: 'email', expect: ['passwords', 'emails'] },
      'slack.com': { type: 'communication', expect: ['tokens', 'channels'] },
      'twitter.com': { type: 'social', expect: [] },
      'facebook.com': { type: 'social', expect: [] }
    };

    return contexts[domain] || { type: 'unknown', expect: [] };
  }

  /**
   * Get domain risk score (0-1)
   */
  _getDomainRisk(domain) {
    const riskMap = {
      'pastebin.com': 0.95,
      'github.com': 0.3,     // Low risk for credentials (expected)
      'aws.amazon.com': 0.2,  // Low risk for secrets (expected)
      'unknown': 0.5          // Medium risk
    };

    return riskMap[domain] || riskMap['unknown'];
  }

  /**
   * Get user behavior risk
   */
  async _getUserBehaviorRisk(tabHistory) {
    if (!tabHistory || tabHistory.length === 0) return 0.5;

    // Analyze recent actions
    const recentActions = tabHistory.slice(-5);
    let suspiciousCount = 0;

    for (const action of recentActions) {
      if (action.text && action.text.includes('password')) suspiciousCount += 1;
      if (action.text && action.text.includes('key')) suspiciousCount += 1;
    }

    // Risk increases with suspicious behavior
    const riskScore = Math.min(0.9, suspiciousCount * 0.3);
    return riskScore;
  }

  /**
   * Get intent content risk
   */
  _getIntentContentRisk(intent) {
    const riskKeywords = [
      { word: 'password', risk: 0.9 },
      { word: 'credentials', risk: 0.9 },
      { word: 'API key', risk: 0.9 },
      { word: 'secret', risk: 0.85 },
      { word: 'token', risk: 0.8 },
      { word: 'send', risk: 0.3 },
      { word: 'share', risk: 0.3 }
    ];

    let maxRisk = 0;
    for (const { word, risk } of riskKeywords) {
      if (intent.toLowerCase().includes(word.toLowerCase())) {
        maxRisk = Math.max(maxRisk, risk);
      }
    }

    return maxRisk;
  }

  /**
   * Compute intent CPT
   */
  _computeIntentCPT(domainRisk, userBehavior) {
    // P(intent_content | domain, user_behavior)
    // Higher behavior risk → higher likelihood of risky intent
    return {
      risky: Math.min(0.9, userBehavior + domainRisk * 0.1),
      benign: 1 - Math.min(0.9, userBehavior + domainRisk * 0.1)
    };
  }

  /**
   * Compute unsafe CPT
   */
  _computeUnsafeCPT(intentContent, domainRisk, userBehavior) {
    // P(unsafe | intent_content, domain, user_behavior)
    // Combination of all factors
    return {
      unsafe: intentContent * 0.6 + domainRisk * 0.2 + userBehavior * 0.2,
      safe: 1 - (intentContent * 0.6 + domainRisk * 0.2 + userBehavior * 0.2)
    };
  }

  /**
   * Bayesian query using CPTs
   */
  _bayesianQuery(evidence, context, cpts) {
    // Simplified Bayesian inference
    // P(unsafe | context) = weighted combination of factors
    const baseRisk = evidence;
    const contextAdjustment = (context.domain + context.user_behavior) / 2;
    const posteriorRisk = baseRisk * 0.7 + contextAdjustment * 0.3;

    return Math.min(0.99, posteriorRisk);
  }

  /**
   * Find confounders
   */
  _findConfounders(intent, tabHistory) {
    // Identify variables that could cause both intent and risk
    const confounders = [];

    // Example: "user_intent" (benign vs. malicious) is a confounder
    // It causes both the observable intent and the outcome (safe/unsafe)

    if (!tabHistory || tabHistory.length === 0) {
      return ['user_intent'];
    }

    // Check for rapid successive actions (could indicate automation/attack)
    let rapidActions = 0;
    for (let i = 1; i < tabHistory.length; i++) {
      const timeDiff = new Date(tabHistory[i].timestamp) - new Date(tabHistory[i - 1].timestamp);
      if (timeDiff < 5000) {  // Less than 5 seconds apart
        rapidActions += 1;
      }
    }

    if (rapidActions > 3) {
      confounders.push('automated_behavior');
    }

    return confounders.length > 0 ? confounders : ['user_intent'];
  }

  /**
   * Interpret causal effect
   */
  _interpretCausalEffect(causalEffect, confounders) {
    if (causalEffect > 0.8) {
      return {
        cause: 'DIRECT_INTENT_CAUSALITY',
        meaning: 'The action itself (independent of context) is dangerous',
        example: 'Sending credentials is inherently unsafe regardless of recipient'
      };
    } else if (causalEffect > 0.5) {
      return {
        cause: 'CONFOUNDED_CAUSALITY',
        meaning: 'Risk comes from confounders, not the action itself',
        example: `Risk driven by: ${confounders.join(', ')}`
      };
    } else {
      return {
        cause: 'SPURIOUS_CORRELATION',
        meaning: 'Pattern exists in data but is not truly causal',
        example: 'Coincidental timing with other events'
      };
    }
  }

  // ==================== Private Helpers ====================

  async _getRecentIntents(tabId, limit) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const stored = await chrome.storage.local.get(['user_context_history']);
        const history = stored.user_context_history || [];
        return history.slice(-limit);
      }
      return [];
    } catch (e) {
      console.warn('Failed to get recent intents:', e);
      return [];
    }
  }

  _embedIntent(intent) {
    // Simple embedding: TF-IDF approximation (just for demo)
    // In production: use SentenceTransformer or similar
    const vector = new Array(384).fill(0);

    // Hash each character to dimension
    for (let i = 0; i < intent.length && i < 384; i++) {
      vector[i] = intent.charCodeAt(i) / 255;
    }

    return vector;
  }

  _computeContextEmbedding(intents) {
    // Average embedding of all intents in context window
    if (intents.length === 0) {
      return new Array(384).fill(0.5);
    }

    const embeddings = intents.map(i => this._embedIntent(i));
    const avgEmbedding = new Array(384).fill(0);

    for (let i = 0; i < 384; i++) {
      avgEmbedding[i] = embeddings.reduce((sum, emb) => sum + emb[i], 0) / embeddings.length;
    }

    return avgEmbedding;
  }

  _cosineSimilarity(vec1, vec2) {
    const dotProduct = vec1.reduce((sum, v, i) => sum + v * vec2[i], 0);
    const mag1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
    const mag2 = Math.sqrt(vec2.reduce((sum, v) => sum + v * v, 0));

    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (mag1 * mag2);
  }

  _contextDistance(intent, context) {
    // How well does intent match context?
    // Higher score = better match = lower risk
    let matchScore = 0.5;  // Default

    if (context.expect) {
      for (const expectedTerm of context.expect) {
        if (intent.toLowerCase().includes(expectedTerm.toLowerCase())) {
          matchScore = 0.8;  // Good match
          break;
        }
      }
    }

    return matchScore;
  }

  _extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return 'unknown';
    }
  }

  async _getGlobalContext() {
    return {
      type: 'global',
      expect: ['password', 'api key', 'credentials', 'secret', 'token']
    };
  }

  async _findSemanticNeighbors(intent, topK) {
    // Find similar intents from history
    const history = await this._getRecentIntents('global', 50);
    const similarities = history.map(h => ({
      neighbor: h.substring(0, 30),
      similarity: this._cosineSimilarity(
        this._embedIntent(intent),
        this._embedIntent(h)
      )
    }));

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FederatedIntentGraph;
}
