/**
 * Frontier Integrations: Wire Phase 1 Enhancements
 * ================================================
 *
 * Integrates:
 * - Compliance Auto-Mapper (Enhancement 7)
 * - LLM Supply Chain Auditor (Enhancement 9)
 *
 * Into existing extension infrastructure:
 * - background.js (for detection → compliance mapping)
 * - popup.js (for compliance dashboard display)
 * - multi-model-router.js (for model auditing)
 *
 * This module is loaded after all frontier modules are imported.
 */

const FrontierIntegrations = (() => {
  console.log('🚀 Initializing Frontier Integrations (Phase 1)...');

  // ==================== INTEGRATION 1: Compliance Mapper ====================

  /**
   * Hook into detection pipeline:
   * detection → ZK Proof → Compliance Mapping → Storage
   */
  async function hookComplianceMapper() {
    if (typeof window !== 'undefined' && window.ZKProofController) {
      // Browser environment (extension)
      const originalGenerateProof = window.ZKProofController.generateProof;

      window.ZKProofController.generateProof = async function(detection, sender) {
        // 1. Generate ZK proof as normal
        const proof = await originalGenerateProof.call(this, detection, sender);

        // 2. Map detection to compliance regulations
        if (typeof ComplianceAutoMapper !== 'undefined') {
          proof.compliance_mapping = await ComplianceAutoMapper.mapDetectionToCompliance(detection);

          // 3. Store compliance metadata
          await ComplianceAutoMapper.storeComplianceMetadata(proof.id, proof.compliance_mapping);

          console.log(`✅ Compliance mapped: ${proof.compliance_mapping.applicable_regulations.length} regulations`);
        }

        return proof;
      };
    }
  }

  /**
   * Expose compliance actions to popup
   */
  function exposeComplianceAPIs() {
    if (typeof window !== 'undefined') {
      window.getCompliancePendingActions = async () => {
        if (typeof ComplianceAutoMapper !== 'undefined') {
          return await ComplianceAutoMapper.getPendingActions();
        }
        return [];
      };

      window.exportComplianceReport = async (dateRange, format = 'json') => {
        if (typeof ComplianceAutoMapper !== 'undefined') {
          return await ComplianceAutoMapper.exportComplianceReport(dateRange, format);
        }
        return null;
      };

      console.log('✅ Compliance APIs exposed to popup');
    }
  }

  // ==================== INTEGRATION 2: Supply Chain Auditor ====================

  /**
   * Initialize auditor and hook multi-model router
   */
  async function hookSupplyChainAuditor() {
    if (typeof global !== 'undefined' && typeof require !== 'undefined') {
      // Node.js/Cloudflare Worker environment
      try {
        const LLMSupplyChainAuditor = require('./llm_supply_chain_auditor.js');
        const auditor = new LLMSupplyChainAuditor({
          enableBlockchain: false,  // Set to true for production blockchain commitment
          maxChainLength: 10000
        });

        // Register known models
        const modelsToRegister = [
          {
            id: 'claude-haiku-4-5-20251001',
            provider: 'anthropic',
            version: '4.5',
            maxInputTokens: 200000,
            maxOutputTokens: 4096,
            dataRetentionDays: 0,
            temperature: 0,
            canFineTune: false,
            canCacheResponses: true,
            regions: ['global']
          },
          {
            id: 'gpt-4o-mini',
            provider: 'openai',
            version: '4o-mini',
            maxInputTokens: 128000,
            maxOutputTokens: 4096,
            dataRetentionDays: 0,
            temperature: 0,
            canFineTune: false,
            canCacheResponses: false,
            regions: ['global']
          },
          {
            id: 'gemini-2.0-flash',
            provider: 'google',
            version: '2.0',
            maxInputTokens: 1000000,
            maxOutputTokens: 8192,
            dataRetentionDays: 0,
            temperature: 0,
            canFineTune: false,
            canCacheResponses: true,
            regions: ['global']
          },
          {
            id: 'mistral-small-latest',
            provider: 'mistral',
            version: 'small-latest',
            maxInputTokens: 32000,
            maxOutputTokens: 8192,
            dataRetentionDays: 0,
            temperature: 0,
            canFineTune: false,
            canCacheResponses: false,
            regions: ['global']
          },
          {
            id: 'mixtral-8x7b-32768',
            provider: 'groq',
            version: '8x7b',
            maxInputTokens: 32768,
            maxOutputTokens: 4096,
            dataRetentionDays: 0,
            temperature: 0,
            canFineTune: false,
            canCacheResponses: false,
            regions: ['global']
          },
          {
            id: 'glm-4-flash',
            provider: 'alibaba',
            version: '4-flash',
            maxInputTokens: 128000,
            maxOutputTokens: 4096,
            dataRetentionDays: 0,
            temperature: 0,
            canFineTune: false,
            canCacheResponses: true,
            regions: ['asia']
          }
        ];

        // Register all models
        for (const modelInfo of modelsToRegister) {
          await auditor.registerModel(modelInfo);
        }

        // Hook routeIntentToMultiModel to audit calls
        const originalRoute = global.routeIntentToMultiModel;

        if (originalRoute) {
          global.routeIntentToMultiModel = async (intent, env, options) => {
            const result = await originalRoute(intent, env, options);

            // Audit each model call
            for (const modelCall of result.model_calls || []) {
              try {
                await auditor.auditModelCall(
                  modelCall.model_id,
                  intent,
                  {
                    text: modelCall.response || '',
                    tokens: modelCall.tokens || 0,
                    latency: modelCall.latency || 0,
                    was_cached: modelCall.was_cached || false,
                    temperature: 0
                  },
                  {
                    endpoint: modelCall.provider,
                    request_id: result.request_id
                  }
                );
              } catch (e) {
                console.error('❌ Failed to audit model call:', e);
              }
            }

            return result;
          };

          // Expose auditor for admin inspection
          global.LLMAuditor = auditor;

          console.log('✅ Supply chain auditor hooked into multi-model router');
        }
      } catch (e) {
        console.error('❌ Failed to hook supply chain auditor:', e);
      }
    }
  }

  /**
   * Expose auditor APIs
   */
  function exposeAuditorAPIs() {
    if (typeof global !== 'undefined') {
      global.getModelSummary = () => {
        if (global.LLMAuditor) {
          return global.LLMAuditor.getSummary();
        }
        return null;
      };

      global.verifyModelProvenance = async (modelId, timeRange) => {
        if (global.LLMAuditor) {
          return await global.LLMAuditor.verifyModelProvenance(modelId, timeRange);
        }
        return null;
      };

      global.exportAuditTrail = async (format = 'json', dateRange = null) => {
        if (global.LLMAuditor) {
          return await global.LLMAuditor.exportAuditTrail(format, dateRange);
        }
        return null;
      };

      console.log('✅ Auditor APIs exposed');
    }
  }

  // ==================== PUBLIC API ====================

  return {
    // Initialize all integrations
    async init() {
      console.log('🚀 Initializing Phase 1 Frontier Integrations...');

      await hookComplianceMapper();
      exposeComplianceAPIs();

      await hookSupplyChainAuditor();
      exposeAuditorAPIs();

      console.log('✅ All Phase 1 integrations initialized');

      // Log status
      return {
        compliance_mapper: typeof ComplianceAutoMapper !== 'undefined' ? 'active' : 'inactive',
        supply_chain_auditor: typeof global !== 'undefined' && global.LLMAuditor ? 'active' : 'inactive',
        apis_exposed: {
          compliance: [
            'getCompliancePendingActions',
            'exportComplianceReport'
          ],
          auditor: [
            'getModelSummary',
            'verifyModelProvenance',
            'exportAuditTrail'
          ]
        }
      };
    },

    // Get current status
    getStatus() {
      return {
        timestamp: new Date().toISOString(),
        compliance_enabled: typeof ComplianceAutoMapper !== 'undefined',
        auditor_enabled: typeof global !== 'undefined' && global.LLMAuditor,
        compliance_pending_actions: typeof window !== 'undefined' && window.getCompliancePendingActions ? 'callable' : 'unavailable'
      };
    }
  };
})();

// Auto-initialize when loaded
if (typeof FrontierIntegrations !== 'undefined') {
  (async () => {
    const status = await FrontierIntegrations.init();
    console.log('🎯 Phase 1 Integrations Status:', status);
  })();
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FrontierIntegrations;
}
