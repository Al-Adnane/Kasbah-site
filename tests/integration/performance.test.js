/**
 * Kasbah Guard - Performance Test Suite v1.0.0
 *
 * Measures detection latency across all browsers and platforms
 * Tests: p50, p95, p99 latency, burst detection, memory leaks
 *
 * Run: node tests/integration/performance.test.js
 */

const fs = require('fs');
const path = require('path');

// Load detector.js (using CommonJS require)
const detectorPath = path.join(__dirname, '../../kasbah-guard-dist/extensions/chrome/src/detector.js');
const detectorCode = fs.readFileSync(detectorPath, 'utf-8');

// Create a module context and evaluate detector.js
const moduleContext = {
  module: { exports: {} },
  console: console,
  performance: typeof performance !== 'undefined' ? performance : {
    now: () => Date.now(),
  },
  self: {},
  gtag: undefined,
  Math: Math,
};

eval(detectorCode);
const detector = moduleContext.module.exports;

// Test data with various secret formats and obfuscations
const testCases = [
  // Core secrets (should detect quickly)
  { text: "SSN: 123-45-6789", category: "ssn", shouldDetect: true },
  { text: "4111111111111111", category: "cc", shouldDetect: true },
  { text: "Passport AB1234567", category: "passport", shouldDetect: true },
  { text: "sk-proj-abc123def456ghi789", category: "api_key", shouldDetect: true },
  { text: "ghp_1234567890abcdefghijklmnopqrst", category: "github", shouldDetect: true },

  // Obfuscated secrets (slower detection)
  { text: "p@$$w0rd123", category: "l33t", shouldDetect: true },
  { text: "cGFzc3dvcmQ=", category: "base64", shouldDetect: true },
  { text: "S​S​N̸: 123-45-6789", category: "zalgo", shouldDetect: true },
  { text: "p\u0430ssport AB1234567", category: "homoglyph", shouldDetect: true },

  // False positives (should allow quickly)
  { text: "password: test123", category: "fp_test", shouldDetect: false },
  { text: "Lorem ipsum dolor sit amet", category: "lorem", shouldDetect: false },
  { text: "function testPassword() { return true; }", category: "fp_code", shouldDetect: false },
  { text: "// password=admin123", category: "fp_comment", shouldDetect: false },

  // Long text (complexity test)
  { text: "This is a long message with SSN 123-45-6789 embedded somewhere in the middle of many words to test cross-line detection and context filtering", category: "long_text", shouldDetect: true },
];

// Performance metrics collector
class PerformanceCollector {
  constructor() {
    this.latencies = [];
    this.results = [];
  }

  record(latency, test) {
    this.latencies.push(latency);
    this.results.push({ latency, test });
  }

  percentile(p) {
    const sorted = this.latencies.sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  stats() {
    if (this.latencies.length === 0) return { count: 0 };

    const sorted = this.latencies.sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / sorted.length;

    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: parseFloat(mean.toFixed(3)),
      p50: parseFloat(this.percentile(50).toFixed(3)),
      p95: parseFloat(this.percentile(95).toFixed(3)),
      p99: parseFloat(this.percentile(99).toFixed(3)),
    };
  }
}

// Test suite
async function runPerformanceTests() {
  console.log('\n🧪 Kasbah Guard Performance Test Suite v1.0.0\n');

  const collector = new PerformanceCollector();
  let passCount = 0;
  let failCount = 0;

  // Single detection test
  console.log('📊 Single Detection Latency (100 iterations per test case):\n');

  for (const testCase of testCases) {
    const caseLatencies = [];

    // Run 100 times per test case for statistical significance
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      const result = detector.classify(testCase.text);
      const latency = performance.now() - start;

      caseLatencies.push(latency);
      collector.record(latency, testCase);

      // Verify detection accuracy
      const detected = result.decision === 'DENY';
      const isCorrect = detected === testCase.shouldDetect;

      if (i === 0) {
        // Only check accuracy on first iteration
        if (isCorrect) {
          passCount++;
          console.log(`  ✓ ${testCase.category.padEnd(15)} - ${detected ? 'BLOCKED' : 'ALLOWED'} (correct)`);
        } else {
          failCount++;
          console.log(`  ✗ ${testCase.category.padEnd(15)} - Expected ${testCase.shouldDetect ? 'BLOCK' : 'ALLOW'}, got ${detected ? 'BLOCK' : 'ALLOW'}`);
        }
      }
    }
  }

  console.log('\n📈 Latency Statistics (all iterations):\n');
  const stats = collector.stats();
  console.log(`  Total iterations: ${stats.count}`);
  console.log(`  Min latency:      ${stats.min.toFixed(3)}ms`);
  console.log(`  Max latency:      ${stats.max.toFixed(3)}ms`);
  console.log(`  Mean latency:     ${stats.mean}ms`);
  console.log(`  p50 latency:      ${stats.p50}ms (50th percentile)`);
  console.log(`  p95 latency:      ${stats.p95}ms (95th percentile)`);
  console.log(`  p99 latency:      ${stats.p99}ms (99th percentile)\n`);

  // Burst test (rapid-fire detections)
  console.log('⚡ Burst Detection Test (1000 detections in rapid succession):\n');

  const burstCollector = new PerformanceCollector();
  const burstStart = performance.now();

  for (let i = 0; i < 1000; i++) {
    const testCase = testCases[i % testCases.length];
    const start = performance.now();
    detector.classify(testCase.text);
    const latency = performance.now() - start;
    burstCollector.record(latency, testCase);
  }

  const burstEnd = performance.now();
  const burstTime = burstEnd - burstStart;
  const burstStats = burstCollector.stats();

  console.log(`  Total time:       ${burstTime.toFixed(0)}ms`);
  console.log(`  Throughput:       ${(1000 / (burstTime / 1000)).toFixed(0)} ops/sec`);
  console.log(`  p50 latency:      ${burstStats.p50}ms`);
  console.log(`  p95 latency:      ${burstStats.p95}ms`);
  console.log(`  p99 latency:      ${burstStats.p99}ms\n`);

  // Memory test (detect memory leaks)
  console.log('💾 Memory Leak Detection Test:\n');

  if (global.gc) {
    global.gc();
  }

  const beforeMem = process.memoryUsage();
  const memCollector = new PerformanceCollector();

  // Run 10,000 classifications
  for (let i = 0; i < 10000; i++) {
    const testCase = testCases[i % testCases.length];
    const start = performance.now();
    detector.classify(testCase.text);
    const latency = performance.now() - start;
    memCollector.record(latency, testCase);
  }

  if (global.gc) {
    global.gc();
  }

  const afterMem = process.memoryUsage();
  const memIncrease = (afterMem.heapUsed - beforeMem.heapUsed) / 1024 / 1024; // MB

  console.log(`  Heap used before: ${(beforeMem.heapUsed / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  Heap used after:  ${(afterMem.heapUsed / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  Memory increase:  ${memIncrease.toFixed(1)}MB (should be <5MB for stable code)`);
  console.log(`  Memory verdict:   ${memIncrease < 5 ? '✓ PASS' : '✗ LEAK DETECTED'}\n`);

  // Summary
  console.log('📋 Test Summary:\n');
  console.log(`  Accuracy tests:   ${passCount} pass, ${failCount} fail`);
  console.log(`  Overall verdict:  ${failCount === 0 ? '✓ ALL TESTS PASS' : '✗ SOME TESTS FAILED'}\n`);

  // Performance targets
  console.log('🎯 Performance Targets (v1.0.0):\n');
  const targets = {
    'p50 < 0.5ms': stats.p50 < 0.5,
    'p95 < 1.0ms': stats.p95 < 1.0,
    'p99 < 2.0ms': stats.p99 < 2.0,
    'Mean < 0.4ms': stats.mean < 0.4,
    'Burst p99 < 5.0ms': burstStats.p99 < 5.0,
    'Memory stable': memIncrease < 5,
  };

  let targetPass = 0;
  let targetFail = 0;

  Object.entries(targets).forEach(([target, pass]) => {
    console.log(`  ${pass ? '✓' : '✗'} ${target}`);
    if (pass) targetPass++; else targetFail++;
  });

  console.log(`\n  Target verdict: ${targetFail === 0 ? '✓ ALL TARGETS MET' : `✗ ${targetFail} targets missed`}\n`);

  // Exit with appropriate code
  process.exit(failCount > 0 || targetFail > 0 ? 1 : 0);
}

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Run tests
runPerformanceTests().catch(err => {
  console.error('❌ Test Error:', err);
  process.exit(1);
});
