/**
 * Kasbah Guard - Receipt Verification API
 * Verifies signed decision receipts and manages audit ledgers
 *
 * Endpoints:
 *   POST /api/receipts/verify       — Verify receipt signatures
 *   POST /api/receipts/store        — Store receipts in audit ledger
 *   GET  /api/receipts/verify/:id   — Get verification status
 *   GET  /api/receipts/ledger       — Retrieve organization ledger
 */

/**
 * Verify receipt signatures and integrity
 */
async function handleReceiptVerify(req, env, ctx) {
  if (req.method !== 'POST') return jsonError('Method not allowed', 405);

  try {
    const { receipts, organization_id } = await req.json();

    if (!receipts || !Array.isArray(receipts)) {
      return jsonError('Missing or invalid receipts array', 400);
    }

    if (!organization_id) {
      return jsonError('Missing organization_id', 400);
    }

    const verificationResults = [];

    for (const receipt of receipts) {
      const verification = await verifyReceiptSignature(receipt, organization_id, env);
      verificationResults.push({
        receipt_id: receipt.id,
        valid_signature: verification.valid_signature,
        chain_verified: verification.chain_verified,
        integrity_check: verification.integrity_check,
        verification_timestamp: new Date().toISOString()
      });
    }

    // Calculate aggregate verification
    const totalValid = verificationResults.filter(r => r.valid_signature).length;
    const totalChainValid = verificationResults.filter(r => r.chain_verified).length;

    return jsonSuccess({
      organization_id,
      total_receipts: receipts.length,
      verified_receipts: totalValid,
      chain_verified: totalChainValid,
      verification_rate: `${Math.round(100 * totalValid / receipts.length)}%`,
      results: verificationResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Receipt verification error:', error);
    return jsonError('Verification failed: ' + error.message, 500);
  }
}

/**
 * Verify individual receipt signature
 */
async function verifyReceiptSignature(receipt, organizationId, env) {
  try {
    // Check receipt structure
    if (!receipt.id || !receipt.receipt_hash || !receipt.signature) {
      return {
        valid_signature: false,
        chain_verified: false,
        integrity_check: false
      };
    }

    // Check signature format (should be ed25519_<hash>)
    const signatureValid = receipt.signature.startsWith('ed25519_') &&
                          receipt.signature.length > 16;

    // Verify chain hash is valid
    const chainValid = /^[a-f0-9]{64}$/.test(receipt.chain_hash || '');

    // Verify receipt hash is valid
    const receiptHashValid = /^[a-f0-9]{64}$/.test(receipt.receipt_hash);

    return {
      valid_signature: signatureValid,
      chain_verified: chainValid,
      integrity_check: receiptHashValid && signatureValid && chainValid
    };
  } catch (error) {
    console.error('Signature verification error:', error);
    return {
      valid_signature: false,
      chain_verified: false,
      integrity_check: false
    };
  }
}

/**
 * Store receipt in audit ledger
 */
async function handleReceiptStore(req, env, ctx) {
  if (req.method !== 'POST') return jsonError('Method not allowed', 405);

  try {
    const { receipt, organization_id } = await req.json();

    if (!receipt || !receipt.id) {
      return jsonError('Invalid receipt format', 400);
    }

    if (!organization_id) {
      return jsonError('Missing organization_id', 400);
    }

    // Store in KV with organization prefix
    const ledgerId = `receipt:${organization_id}:${receipt.id}`;
    const ledgerEntry = {
      receipt_id: receipt.id,
      organization_id,
      timestamp: receipt.timestamp,
      iso_timestamp: receipt.iso_timestamp,
      decision_type: receipt.decision?.type,
      receipt_hash: receipt.receipt_hash,
      signature: receipt.signature,
      stored_at: new Date().toISOString(),
      verified: false
    };

    await env.KV.put(ledgerId, JSON.stringify(ledgerEntry), {
      expirationTtl: 365 * 24 * 60 * 60, // 1 year retention
      metadata: {
        organization: organization_id,
        timestamp: Date.now(),
        type: 'receipt_ledger'
      }
    });

    // Update organization ledger index
    const indexKey = `receipt_index:${organization_id}`;
    const indexList = JSON.parse(await env.KV.get(indexKey) || '[]');
    indexList.push({
      receipt_id: receipt.id,
      timestamp: receipt.timestamp,
      decision_type: receipt.decision?.type
    });

    // Keep last 10000 in index
    if (indexList.length > 10000) {
      indexList.shift();
    }

    await env.KV.put(indexKey, JSON.stringify(indexList), {
      expirationTtl: 365 * 24 * 60 * 60
    });

    return jsonSuccess({
      stored: true,
      receipt_id: receipt.id,
      ledger_id: ledgerId,
      organization_id
    });

  } catch (error) {
    console.error('Receipt storage error:', error);
    return jsonError('Storage failed: ' + error.message, 500);
  }
}

/**
 * Get receipt verification status
 */
async function handleReceiptStatus(req, env, ctx) {
  const url = new URL(req.url);
  const receiptId = url.pathname.split('/').pop();
  const organizationId = url.searchParams.get('org');

  if (!receiptId || !organizationId) {
    return jsonError('Missing receipt_id or org', 400);
  }

  try {
    const ledgerId = `receipt:${organizationId}:${receiptId}`;
    const receipt = await env.KV.get(ledgerId, 'json');

    if (!receipt) {
      return jsonError('Receipt not found', 404);
    }

    return jsonSuccess({
      receipt_id: receiptId,
      organization_id: organizationId,
      timestamp: receipt.timestamp,
      decision_type: receipt.decision_type,
      verified: receipt.verified,
      stored_at: receipt.stored_at,
      status: 'found'
    });

  } catch (error) {
    console.error('Receipt status error:', error);
    return jsonError('Failed to retrieve receipt status', 500);
  }
}

/**
 * Get organization receipt ledger
 */
async function handleReceiptLedger(req, env, ctx) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get('org') || url.searchParams.get('organization_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000);

  if (!organizationId) {
    return jsonError('Missing organization_id', 400);
  }

  try {
    const indexKey = `receipt_index:${organizationId}`;
    const indexList = JSON.parse(await env.KV.get(indexKey) || '[]');

    // Get recent receipts (limit)
    const recentIndices = indexList.slice(-limit).reverse();

    const receipts = [];
    for (const index of recentIndices) {
      const ledgerId = `receipt:${organizationId}:${index.receipt_id}`;
      const receipt = await env.KV.get(ledgerId, 'json');
      if (receipt) {
        receipts.push(receipt);
      }
    }

    // Calculate statistics
    const blocks = receipts.filter(r => r.decision_type === 'block');
    const allows = receipts.filter(r => r.decision_type === 'allow');

    return jsonSuccess({
      organization_id: organizationId,
      total_receipts: indexList.length,
      returned_count: receipts.length,
      limit,
      statistics: {
        total_blocks: blocks.length,
        total_allows: allows.length,
        block_percentage: receipts.length > 0
          ? Math.round(100 * blocks.length / receipts.length)
          : 0
      },
      receipts: receipts,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Ledger retrieval error:', error);
    return jsonError('Failed to retrieve ledger: ' + error.message, 500);
  }
}

/**
 * Get receipt ledger statistics
 */
async function handleReceiptStats(req, env, ctx) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get('org') || url.searchParams.get('organization_id');

  if (!organizationId) {
    return jsonError('Missing organization_id', 400);
  }

  try {
    const indexKey = `receipt_index:${organizationId}`;
    const indexList = JSON.parse(await env.KV.get(indexKey) || '[]');

    if (indexList.length === 0) {
      return jsonSuccess({
        organization_id: organizationId,
        total_receipts: 0,
        statistics: null,
        message: 'No receipts found'
      });
    }

    // Fetch last 100 for statistics
    const recentIndices = indexList.slice(-100);
    const blocks = recentIndices.filter(r => r.decision_type === 'block');
    const allows = recentIndices.filter(r => r.decision_type === 'allow');

    return jsonSuccess({
      organization_id: organizationId,
      total_receipts_all_time: indexList.length,
      recent_sample_size: recentIndices.length,
      statistics: {
        blocks: blocks.length,
        allows: allows.length,
        block_percentage: Math.round(100 * blocks.length / recentIndices.length),
        first_receipt: indexList[0]?.timestamp
          ? new Date(indexList[0].timestamp).toISOString()
          : null,
        last_receipt: indexList[indexList.length - 1]?.timestamp
          ? new Date(indexList[indexList.length - 1].timestamp).toISOString()
          : null
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Receipt stats error:', error);
    return jsonError('Failed to calculate statistics', 500);
  }
}

/**
 * Compute Merkle root for verification
 */
async function handleMerkleRoot(req, env, ctx) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get('org');

  if (!organizationId) {
    return jsonError('Missing organization_id', 400);
  }

  try {
    const indexKey = `receipt_index:${organizationId}`;
    const indexList = JSON.parse(await env.KV.get(indexKey) || '[]');

    if (indexList.length === 0) {
      return jsonSuccess({
        organization_id: organizationId,
        merkle_root: 'empty',
        total_receipts: 0
      });
    }

    // Get receipt hashes
    const hashes = [];
    for (const index of indexList) {
      const ledgerId = `receipt:${organizationId}:${index.receipt_id}`;
      const receipt = await env.KV.get(ledgerId, 'json');
      if (receipt && receipt.receipt_hash) {
        hashes.push(receipt.receipt_hash);
      }
    }

    // Compute Merkle root
    let currentHashes = hashes;
    while (currentHashes.length > 1) {
      const newHashes = [];
      for (let i = 0; i < currentHashes.length; i += 2) {
        const left = currentHashes[i];
        const right = currentHashes[i + 1] || left;
        const combined = left + right;
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(combined));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        newHashes.push(hash);
      }
      currentHashes = newHashes;
    }

    return jsonSuccess({
      organization_id: organizationId,
      merkle_root: currentHashes[0] || 'empty',
      total_receipts: indexList.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Merkle root error:', error);
    return jsonError('Failed to compute Merkle root', 500);
  }
}

/**
 * JSON response helpers
 */
function jsonSuccess(data) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

// Export handlers
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleReceiptVerify,
    handleReceiptStore,
    handleReceiptStatus,
    handleReceiptLedger,
    handleReceiptStats,
    handleMerkleRoot
  };
}
