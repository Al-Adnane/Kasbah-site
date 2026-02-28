/**
 * @kasbah/guard/browser — Browser-specific adapter
 *
 * Loads detector.js via dynamic script injection (fallback if not bundled).
 * In modern bundler environments, the SDK is fully self-contained.
 */

export { classify, getRisk, getDecision, isSafe, redact } from './classify.js';

/**
 * Load detector.js from a CDN or local URL.
 * Only needed in plain HTML pages (not required when using a bundler).
 *
 * @example
 * ```html
 * <script type="module">
 *   import { loadDetector } from '@kasbah/guard/browser';
 *   await loadDetector('/wasm/kasbah_wasm.js');
 *   // Then: classify(), redact(), etc. are available
 * </script>
 * ```
 */
export async function loadDetector(wasmUrl?: string): Promise<void> {
  if (wasmUrl) {
    // Try WASM first
    try {
      const { default: init, classify } = await import(/* @vite-ignore */ wasmUrl);
      await init();
      // Monkey-patch global for classify.ts to pick up
      (window as unknown as Record<string, unknown>)['classify'] = (text: string) => {
        const raw = classify(text);
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      };
      return;
    } catch (_e) {
      console.warn('[kasbah/guard] WASM load failed, falling back to JS engine');
    }
  }
  // JS fallback is automatic — classify.ts checks window.classify
}
