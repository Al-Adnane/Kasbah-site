/**
 * Kasbah Guard - False Positive Dashboard Backend v1.0.0
 *
 * Admin API for analyzing and prioritizing false positive reports
 * Endpoints:
 *   GET /api/admin/false-positives - List all FP reports
 *   GET /api/admin/false-positives/:id - Get specific FP report
 *   POST /api/admin/false-positives/:id/verify - Verify if FP is real
 *   POST /api/admin/false-positives/:id/fix - Mark as fixed
 *   GET /api/admin/false-positives/stats - Aggregate statistics
 */

import { Router, Request, Response } from 'express';
import { KVNamespace } from '@cloudflare/workers-types';

interface FalsePositiveReport {
  id: string;
  pattern: string;
  context: string;
  extensionVersion: string;
  browser: string;
  timestamp: string;
  count: number;
  verified: boolean;
  isRealFP: boolean;
  fixed: boolean;
  fixedAt?: string;
  notes?: string;
}

interface FPStats {
  totalReports: number;
  unverified: number;
  verified: number;
  realFPs: number;
  fixed: number;
  byBrowser: Record<string, number>;
  byPattern: Record<string, number>;
  topPatterns: Array<{ pattern: string; count: number; isRealFP: boolean }>;
}

export class FalsePositiveAdmin {
  private kv: KVNamespace;
  private router: Router;

  constructor(kv: KVNamespace) {
    this.kv = kv;
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/stats', this.getStats.bind(this));
    this.router.get('/', this.listReports.bind(this));
    this.router.get('/:id', this.getReport.bind(this));
    this.router.post('/:id/verify', this.verifyReport.bind(this));
    this.router.post('/:id/fix', this.markFixed.bind(this));
  }

  /**
   * GET /api/admin/false-positives/stats
   * Returns aggregate statistics on false positives
   */
  private async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats: FPStats = {
        totalReports: 0,
        unverified: 0,
        verified: 0,
        realFPs: 0,
        fixed: 0,
        byBrowser: {},
        byPattern: {},
        topPatterns: [],
      };

      // Fetch all FP reports from KV
      const listResult = await this.kv.list({ prefix: 'fp:' });

      for (const item of listResult.keys) {
        const report = await this.kv.get(item.name, 'json') as FalsePositiveReport;
        if (!report) continue;

        stats.totalReports++;
        if (report.verified) stats.verified++;
        else stats.unverified++;
        if (report.isRealFP) stats.realFPs++;
        if (report.fixed) stats.fixed++;

        // Count by browser
        stats.byBrowser[report.browser] = (stats.byBrowser[report.browser] || 0) + 1;

        // Count by pattern (top 20)
        const patternKey = report.pattern.slice(0, 30);
        stats.byPattern[patternKey] = (stats.byPattern[patternKey] || 0) + report.count;
      }

      // Get top 10 patterns by frequency
      stats.topPatterns = Object.entries(stats.byPattern)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([pattern, count]) => ({
          pattern,
          count,
          isRealFP: Object.values(listResult.keys).some(k => k.name.includes(pattern)),
        }));

      res.json({
        ok: true,
        stats,
        reportedAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: `Failed to fetch stats: ${(error as Error).message}`,
      });
    }
  }

  /**
   * GET /api/admin/false-positives
   * List all false positive reports with optional filtering
   */
  private async listReports(req: Request, res: Response): Promise<void> {
    try {
      const { browser, verified, realFp, limit = 100, offset = 0 } = req.query;

      const listResult = await this.kv.list({ prefix: 'fp:', limit: 1000 });
      let reports: FalsePositiveReport[] = [];

      for (const item of listResult.keys) {
        const report = await this.kv.get(item.name, 'json') as FalsePositiveReport;
        if (!report) continue;

        // Apply filters
        if (browser && report.browser !== browser) continue;
        if (verified !== undefined && report.verified !== (verified === 'true')) continue;
        if (realFp !== undefined && report.isRealFP !== (realFp === 'true')) continue;

        reports.push(report);
      }

      // Sort by count (most common first)
      reports.sort((a, b) => b.count - a.count);

      // Apply pagination
      const start = Math.max(0, Number(offset) || 0);
      const take = Math.max(1, Math.min(1000, Number(limit) || 100));
      const paginated = reports.slice(start, start + take);

      res.json({
        ok: true,
        reports: paginated,
        total: reports.length,
        offset: start,
        limit: take,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: `Failed to list reports: ${(error as Error).message}`,
      });
    }
  }

  /**
   * GET /api/admin/false-positives/:id
   * Fetch a specific false positive report
   */
  private async getReport(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const report = await this.kv.get(id, 'json') as FalsePositiveReport | null;

      if (!report) {
        res.status(404).json({
          ok: false,
          error: 'Report not found',
        });
        return;
      }

      res.json({
        ok: true,
        report,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: `Failed to fetch report: ${(error as Error).message}`,
      });
    }
  }

  /**
   * POST /api/admin/false-positives/:id/verify
   * Verify if a reported false positive is actually a false positive
   */
  private async verifyReport(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { isRealFP, notes } = req.body;

      const report = await this.kv.get(id, 'json') as FalsePositiveReport | null;

      if (!report) {
        res.status(404).json({
          ok: false,
          error: 'Report not found',
        });
        return;
      }

      // Update report
      report.verified = true;
      report.isRealFP = isRealFP === true;
      report.notes = notes || undefined;

      await this.kv.put(id, JSON.stringify(report));

      res.json({
        ok: true,
        message: `Report verified: ${isRealFP ? 'REAL FALSE POSITIVE' : 'NOT A FALSE POSITIVE'}`,
        report,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: `Failed to verify report: ${(error as Error).message}`,
      });
    }
  }

  /**
   * POST /api/admin/false-positives/:id/fix
   * Mark a false positive as fixed (pattern improved in detector.js)
   */
  private async markFixed(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const report = await this.kv.get(id, 'json') as FalsePositiveReport | null;

      if (!report) {
        res.status(404).json({
          ok: false,
          error: 'Report not found',
        });
        return;
      }

      // Mark as fixed
      report.fixed = true;
      report.fixedAt = new Date().toISOString();
      report.notes = `${report.notes || ''}\n[FIXED] ${notes || 'Fix applied'}`.trim();

      await this.kv.put(id, JSON.stringify(report));

      res.json({
        ok: true,
        message: 'Report marked as fixed',
        report,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: `Failed to mark report as fixed: ${(error as Error).message}`,
      });
    }
  }

  /**
   * Export router for use in Express app
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Analyze patterns to identify common false positive sources
   */
  async analyzePatternsForFixes(): Promise<Record<string, unknown>> {
    const analysis: Record<string, unknown> = {};

    const listResult = await this.kv.list({ prefix: 'fp:', limit: 1000 });

    const patterns: Map<string, { count: number; contexts: string[] }> = new Map();

    for (const item of listResult.keys) {
      const report = await this.kv.get(item.name, 'json') as FalsePositiveReport;
      if (!report || !report.isRealFP) continue;

      const patternKey = report.pattern.slice(0, 30);
      const existing = patterns.get(patternKey) || { count: 0, contexts: [] };
      existing.count += report.count;
      if (report.context && !existing.contexts.includes(report.context)) {
        existing.contexts.push(report.context);
      }
      patterns.set(patternKey, existing);
    }

    // Sort by frequency
    const sorted = Array.from(patterns.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);

    analysis.topFalsePositives = Object.fromEntries(sorted);
    analysis.recommendedFixes = sorted.map(([pattern, data]) => ({
      pattern,
      frequency: data.count,
      commonContexts: data.contexts.slice(0, 3),
      recommendation: `Add context filter or refine pattern matching for: ${pattern}`,
    }));

    return analysis;
  }
}

/**
 * Integration with Cloudflare Worker
 *
 * In your worker.js fetch handler:
 *
 * ```typescript
 * if (path === '/api/admin/false-positives' || path.startsWith('/api/admin/false-positives/')) {
 *   const admin = new FalsePositiveAdmin(env.KASBAH_KV);
 *   response = await admin.getRouter()(request);
 * }
 * ```
 */

export default FalsePositiveAdmin;
