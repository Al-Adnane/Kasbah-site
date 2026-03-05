/**
 * Intent Classifier WebWorker
 *
 * Runs IntentClassifier in a dedicated WebWorker thread so that
 * model loading (~67MB) and inference (~50-200ms) never block the UI thread.
 *
 * Message protocol:
 *   Incoming → { type: 'init' }
 *     Triggers model pre-warm. Posts back { type: 'init_complete', data: { success: boolean } }
 *
 *   Incoming → { type: 'classify', id: string, data: detectionContext }
 *     detectionContext: { content, url, elementType, surroundingText }
 *     Posts back { type: 'result', id: string, data: classificationResult }
 *     classificationResult: { intent, confidence, reasoning, usedModel }
 *
 *   Incoming → { type: 'stats' }
 *     Posts back { type: 'stats', data: statsObject }
 *
 *   Incoming → { type: 'should_block', id: string, data: { context, threshold } }
 *     Posts back { type: 'should_block_result', id: string, data: boolean }
 *
 * Error responses always include { type: 'error', id: string|null, error: string }
 */

'use strict';

// ── Transformers.js CDN import ──────────────────────────────────────────────
// Loaded lazily on first 'init' or 'classify' message. Workers support
// importScripts() for synchronous loading; dynamic import() is also supported
// in modern browser workers (Chrome 80+, Firefox 114+).

var _transformersPipeline = null;
var _pipelinePromise = null;
var _modelReady = false;

var MODEL_ID = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';
var CDN_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';

// ── In-worker IntentClassifier (self-contained, no external file dep) ───────
// Mirrors intent_classifier.js so the worker is fully standalone.

var _docHostPatterns = [
  /github\.com\/.*\/(README|docs|wiki|examples?)/i,
  /gitlab\.com\/.*\/(README|docs|wiki|examples?)/i,
  /docs\./i,
  /developer\./i,
  /developers\./i,
  /readme\.io/i,
  /gitbook\.io/i,
  /confluence\./i,
  /notion\.so/i,
  /medium\.com/i,
  /dev\.to/i,
  /stackoverflow\.com/i,
  /stackexchange\.com/i,
  /hackernoon\.com/i,
  /towardsdatascience\.com/i,
  /blog\./i,
  /tutorial/i,
  /guide\./i,
  /learn\./i,
  /sandbox\./i,
  /playground\./i,
  /codesandbox\.io/i,
  /codepen\.io/i,
  /jsfiddle\.net/i,
  /replit\.com/i,
  /glitch\.com/i
];

var _intentionalKeywords = [
  'example', 'tutorial', 'demo', 'test', 'sample', 'placeholder',
  'replace', 'your_', 'your-', '<your', 'insert', 'change this',
  'fictional', 'fake', 'dummy', 'mock', 'stub', 'template',
  'documentation', 'readme', 'getting started', 'quickstart',
  'how to', 'howto', 'guide', 'walkthrough', 'instruction',
  'eg.', 'e.g.', 'i.e.', 'for instance', 'for example',
  'token here', 'key here', 'password here', 'secret here',
  'xxxx', '****', 'redacted', 'censored', 'sanitized'
];

var _accidentalKeywords = [
  'production', 'prod', 'live', 'real', 'actual', 'private',
  'do not share', 'do not commit', 'keep secret', 'confidential',
  'internal use', 'top secret', 'sensitive', 'never push'
];

var _stats = {
  totalClassified: 0,
  intentionalCount: 0,
  accidentalCount: 0,
  modelUsed: 0,
  heuristicUsed: 0
};

// ── Model initialization ─────────────────────────────────────────────────────

function loadPipeline() {
  if (_pipelinePromise) return _pipelinePromise;

  _pipelinePromise = (async function() {
    try {
      var mod = await import(CDN_URL);
      var pipeline = mod.pipeline;
      _transformersPipeline = await pipeline(
        'text-classification',
        MODEL_ID,
        { quantized: true, progress_callback: null }
      );
      _modelReady = true;
      return true;
    } catch (err) {
      _modelReady = false;
      return false;
    }
  })();

  return _pipelinePromise;
}

// ── Heuristic classifier (synchronous) ───────────────────────────────────────

function heuristicClassify(context) {
  var content = context.content || '';
  var url = context.url || '';
  var elementType = context.elementType || '';
  var surroundingText = context.surroundingText || '';

  var lowerUrl = url.toLowerCase();
  var lowerSurrounding = surroundingText.toLowerCase();
  var lowerElement = elementType.toLowerCase();

  var reasons = [];
  var intentionalScore = 0;
  var accidentalScore = 0;

  // Rule 1: Documentation site URL
  for (var i = 0; i < _docHostPatterns.length; i++) {
    if (_docHostPatterns[i].test(lowerUrl)) {
      intentionalScore += 40;
      reasons.push('doc-site URL match');
      break;
    }
  }

  // Rule 2: Intentional keywords in surrounding text
  for (var j = 0; j < _intentionalKeywords.length; j++) {
    if (lowerSurrounding.indexOf(_intentionalKeywords[j]) !== -1) {
      intentionalScore += 20;
      reasons.push('keyword "' + _intentionalKeywords[j] + '" in surrounding text');
      break;
    }
  }

  // Rule 3: Code block element
  if (lowerElement === 'code' || lowerElement === 'pre' ||
      lowerElement === 'kbd' || lowerElement.indexOf('code') !== -1) {
    intentionalScore += 15;
    reasons.push('element is code/pre block');
  }

  // Rule 4: Placeholder-looking content
  var lowerContent = content.toLowerCase();
  if (/your[_\-]?(api|secret|key|token|password)/i.test(lowerContent) ||
      /\bxxxxxxx+\b/.test(lowerContent) ||
      /\b(example|dummy|fake|test|placeholder)\b/i.test(lowerContent)) {
    intentionalScore += 30;
    reasons.push('content resembles placeholder/example value');
  }

  // Rule 5: Accidental keywords
  for (var k = 0; k < _accidentalKeywords.length; k++) {
    if (lowerSurrounding.indexOf(_accidentalKeywords[k]) !== -1) {
      accidentalScore += 25;
      reasons.push('accidental keyword "' + _accidentalKeywords[k] + '" in context');
      break;
    }
  }

  // Rule 6: Form field
  if (lowerElement === 'input' || lowerElement === 'textarea') {
    accidentalScore += 20;
    reasons.push('element is form input/textarea');
  }

  var totalSignal = intentionalScore + accidentalScore;
  var intent, confidence, reasoning;

  if (totalSignal === 0) {
    intent = 'unknown';
    confidence = 0.5;
    reasoning = 'Insufficient context for heuristic classification';
  } else if (intentionalScore > accidentalScore) {
    intent = 'intentional';
    confidence = Math.min(0.95, 0.5 + (intentionalScore - accidentalScore) / 100);
    reasoning = 'Heuristic signals: ' + reasons.join('; ');
  } else if (accidentalScore > intentionalScore) {
    intent = 'accidental';
    confidence = Math.min(0.95, 0.5 + (accidentalScore - intentionalScore) / 100);
    reasoning = 'Heuristic signals: ' + reasons.join('; ');
  } else {
    intent = 'unknown';
    confidence = 0.5;
    reasoning = 'Heuristic signals tied: ' + reasons.join('; ');
  }

  return { intent: intent, confidence: confidence, reasoning: reasoning, usedModel: false };
}

// ── Model-based classifier ────────────────────────────────────────────────────

async function classifyWithModel(context) {
  var content = context.content || '';
  var url = context.url || '';
  var elementType = context.elementType || '';
  var surroundingText = context.surroundingText || '';

  var prompt = [
    'Context URL: ' + url.slice(0, 120),
    'Element: ' + elementType.slice(0, 40),
    'Surrounding text: ' + surroundingText.slice(0, 200),
    'Detected content begins with: ' + content.slice(0, 60)
  ].join('. ');

  var output = await _transformersPipeline(prompt, { topk: 2 });

  var positiveEntry = null;
  for (var i = 0; i < output.length; i++) {
    if (output[i].label === 'POSITIVE') { positiveEntry = output[i]; break; }
  }
  var positiveScore = positiveEntry ? positiveEntry.score : 0.5;

  var intent, confidence, reasoning;

  if (positiveScore >= 0.55) {
    intent = 'intentional';
    confidence = positiveScore;
    reasoning = 'Model classified context as intentional sharing (positive framing score=' +
      positiveScore.toFixed(3) + ')';
  } else if (positiveScore <= 0.45) {
    intent = 'accidental';
    confidence = 1 - positiveScore;
    reasoning = 'Model classified context as accidental exposure (negative framing score=' +
      (1 - positiveScore).toFixed(3) + ')';
  } else {
    var heuristic = heuristicClassify(context);
    intent = heuristic.intent;
    confidence = Math.max(0.5, heuristic.confidence * 0.8);
    reasoning = 'Model ambiguous; heuristic tie-break: ' + heuristic.reasoning;
  }

  return { intent: intent, confidence: confidence, reasoning: reasoning, usedModel: true };
}

// ── Unified classify entry point ─────────────────────────────────────────────

async function classify(context) {
  _stats.totalClassified++;

  if (_modelReady && _transformersPipeline) {
    try {
      var result = await classifyWithModel(context);
      _stats.modelUsed++;
      if (result.intent === 'intentional') _stats.intentionalCount++;
      else if (result.intent === 'accidental') _stats.accidentalCount++;
      return result;
    } catch (err) {
      // Fall through to heuristics
    }
  }

  var hResult = heuristicClassify(context);
  _stats.heuristicUsed++;
  if (hResult.intent === 'intentional') _stats.intentionalCount++;
  else if (hResult.intent === 'accidental') _stats.accidentalCount++;
  return hResult;
}

// ── Message handler ───────────────────────────────────────────────────────────

self.addEventListener('message', function(event) {
  var msg = event.data;
  if (!msg || !msg.type) return;

  var msgId = msg.id || null;

  switch (msg.type) {

    case 'init':
      // Pre-warm: start loading the model in background
      loadPipeline().then(function(success) {
        self.postMessage({ type: 'init_complete', data: { success: success } });
      }).catch(function(err) {
        self.postMessage({
          type: 'error',
          id: null,
          error: 'init failed: ' + (err && err.message ? err.message : String(err))
        });
      });
      break;

    case 'classify':
      if (!msg.data) {
        self.postMessage({ type: 'error', id: msgId, error: 'missing data in classify message' });
        return;
      }
      // Ensure pipeline is attempted before classifying
      loadPipeline().then(function() {
        return classify(msg.data);
      }).then(function(result) {
        self.postMessage({ type: 'result', id: msgId, data: result });
      }).catch(function(err) {
        self.postMessage({
          type: 'error',
          id: msgId,
          error: 'classify failed: ' + (err && err.message ? err.message : String(err))
        });
      });
      break;

    case 'stats':
      self.postMessage({ type: 'stats', data: Object.assign({}, _stats) });
      break;

    case 'should_block':
      if (!msg.data) {
        self.postMessage({ type: 'error', id: msgId, error: 'missing data in should_block message' });
        return;
      }
      var threshold = (msg.data.threshold !== undefined) ? msg.data.threshold : 0.7;
      loadPipeline().then(function() {
        return classify(msg.data.context || msg.data);
      }).then(function(result) {
        var block = result.intent === 'accidental' && result.confidence > threshold;
        self.postMessage({ type: 'should_block_result', id: msgId, data: block });
      }).catch(function(err) {
        self.postMessage({
          type: 'error',
          id: msgId,
          error: 'should_block failed: ' + (err && err.message ? err.message : String(err))
        });
      });
      break;

    default:
      self.postMessage({
        type: 'error',
        id: msgId,
        error: 'unknown message type: ' + msg.type
      });
  }
});

// Signal readiness immediately (heuristics available, model loading in background)
self.postMessage({ type: 'worker_ready', data: { heuristicsReady: true, modelReady: false } });
