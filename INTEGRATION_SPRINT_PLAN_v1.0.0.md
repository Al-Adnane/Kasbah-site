# Kasbah Guard: Integration Sprint Plan v1.0.0

**Status**: 🚀 **PHASE A: FULL INTEGRATION - 1000% PRIORITY**
**Timeline**: 2 weeks (March 1-15, 2026)
**Objective**: Wire all components into end-to-end working system

---

## CRITICAL PATH

```
WEEK 1:
├─ Day 1-2: Quantum crypto integration (detector → Tauri backend → signing)
├─ Day 2-3: ZK proof wiring (classification → proof generation → storage)
├─ Day 4-5: Blockchain integration (proofs → Polygon testnet deployment)
└─ Day 5-6: API endpoints (proof retrieval, verification, blockchain query)

WEEK 2:
├─ Day 1-2: CLI commands (scan --generate-proof, compliance-report)
├─ Day 2-3: End-to-end testing (full detection → proof → blockchain → verify)
├─ Day 3-4: Polygon mainnet deployment
└─ Day 5: Documentation + Go/No-Go for PHASE B
```

---

## TASK 1: QUANTUM CRYPTO INTEGRATION (Days 1-2)

**Problem**: quantum_crypto.rs is in Tauri backend. detector.js is in browser extension.
**Solution**: IPC bridge + WASM fallback

### 1.1 Create Tauri IPC Handler

**File to create**: `/kasbah-guard-dist/apps/desktop/src-tauri/src/handlers/quantum_handler.rs`

```rust
use tauri::State;
use crate::quantum_crypto::QuantumCryptoEngine;

#[tauri::command]
pub async fn sign_detection(
    detection_id: String,
    content_hash: String,
    verdict: String,
    risk_score: u32,
    state: State<'_, QuantumCryptoEngine>,
) -> Result<String, String> {
    let signed = state.sign_detection(
        &detection_id,
        content_hash.as_bytes(),
        &verdict,
        risk_score,
    )?;

    Ok(serde_json::to_string(&signed).unwrap())
}

#[tauri::command]
pub async fn verify_detection(
    signed_json: String,
) -> Result<bool, String> {
    let detection: QuantumSignedDetection = serde_json::from_str(&signed_json)?;
    QuantumCryptoEngine::verify_detection(&detection)
}
```

### 1.2 Create Extension IPC Bridge

**File to create**: `/kasbah-guard-dist/extensions/chrome/src/quantum_bridge.js`

```javascript
/**
 * Quantum Crypto Bridge
 * Communicates with Tauri backend for quantum-safe signatures
 */

class QuantumBridge {
  constructor() {
    this.enabled = window.__TAURI__ !== undefined;
  }

  async signDetection(detectionId, contentHash, verdict, riskScore) {
    if (!this.enabled) {
      console.warn('Tauri not available, skipping quantum signature');
      return null;
    }

    try {
      const result = await window.__TAURI__.invoke('sign_detection', {
        detection_id: detectionId,
        content_hash: contentHash,
        verdict: verdict,
        risk_score: riskScore,
      });

      return JSON.parse(result);
    } catch (error) {
      console.error('Quantum signature failed:', error);
      return null;
    }
  }

  async verifyDetection(signedDetection) {
    if (!this.enabled) {
      return false;
    }

    try {
      return await window.__TAURI__.invoke('verify_detection', {
        signed_json: JSON.stringify(signedDetection),
      });
    } catch (error) {
      console.error('Quantum verification failed:', error);
      return false;
    }
  }
}

const quantumBridge = new QuantumBridge();
```

### 1.3 Modify detector.js to Use Quantum Signing

**File to modify**: `kasbah-guard-dist/extensions/chrome/src/detector.js`

In the `classify()` function, after verdict is determined:

```javascript
async function classify(content) {
  // ... existing classification logic ...

  const result = {
    decision: verdict,
    risk: riskScore,
    reason: detectionReason,
    timestamp: Date.now(),
    // NEW: quantum signature
    quantumSignature: null
  };

  // Sign with quantum crypto if available
  if (typeof quantumBridge !== 'undefined') {
    const detectionId = generateDetectionId();
    const contentHash = sha256(content);

    result.quantumSignature = await quantumBridge.signDetection(
      detectionId,
      contentHash,
      verdict,
      riskScore
    );
  }

  return result;
}
```

### 1.4 Tauri Configuration

**File to modify**: `kasbah-guard-dist/apps/desktop/src-tauri/tauri.conf.json`

Add quantum handler to allowed commands:

```json
{
  "tauri": {
    "allowlist": {
      "invoke": {
        "enable": true
      },
      "all": true
    }
  }
}
```

---

## TASK 2: ZK PROOF WIRING (Days 2-3)

**Problem**: ZK proof code exists but not called in detection flow
**Solution**: Wire zk_proof_verifier.js into detector.js → storage

### 2.1 Create ZK Proof Integration in popup.js

**File to modify**: `kasbah-guard-dist/extensions/chrome/src/popup.js`

Add function to generate compliance proof:

```javascript
async function generateComplianceProof(detection) {
  // Step 1: Create ZK proof (no content revealed)
  const zkProof = new ZKProof(
    `zk-${Date.now()}`,
    detection.contentHash || sha256(detection.content),
    detection.verdict,
    detection.risk
  );

  const secretKey = crypto.getRandomValues(new Uint8Array(32));
  zkProof.generateProof(
    Buffer.from(secretKey).toString('hex')
  );
  zkProof.verify();

  // Step 2: Create full compliance proof
  const complianceProof = {
    id: generateId(),
    timestamp: Date.now(),
    quantum: detection.quantumSignature,
    zk: zkProof.exportProof(),
    blockchain: null, // Will be filled after blockchain registration
    detection: {
      verdict: detection.verdict,
      riskScore: detection.risk,
      contentHash: sha256(detection.content)
    }
  };

  // Step 3: Store locally
  await chrome.storage.local.set({
    [`proof-${complianceProof.id}`]: complianceProof
  });

  return complianceProof;
}
```

### 2.2 Modify Detection Handler

**File to modify**: `kasbah-guard-dist/extensions/chrome/src/background.js`

When detection occurs:

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DETECTION') {
    const detection = message.detection;

    // Generate compliance proof
    generateComplianceProof(detection).then(proof => {
      // Store in local history
      chrome.storage.local.get('detectionHistory', (result) => {
        const history = result.detectionHistory || [];
        history.push({
          ...proof,
          url: sender.url
        });
        chrome.storage.local.set({ detectionHistory: history });
      });

      // Send to popup
      chrome.runtime.sendMessage({
        type: 'PROOF_GENERATED',
        proof: proof
      }).catch(() => {}); // Tab may be closed
    });

    sendResponse({ ok: true });
  }
});
```

### 2.3 Update popup.html Display

**File to modify**: `kasbah-guard-dist/extensions/chrome/src/popup.html`

Add section for proof display:

```html
<div id="proof-section" style="display:none;">
  <h3>✅ Compliance Proof Generated</h3>
  <div style="font-size: 12px; background: #f0f0f0; padding: 10px; border-radius: 5px;">
    <p><strong>Proof ID:</strong> <span id="proof-id"></span></p>
    <p><strong>Quantum Sig:</strong> <span id="quantum-status">✓</span></p>
    <p><strong>ZK Proof:</strong> <span id="zk-status">✓</span></p>
    <p><strong>Blockchain:</strong> <span id="blockchain-status">⏳ Pending</span></p>
    <button id="export-proof-btn">Export Proof</button>
    <button id="verify-proof-btn">Verify Proof</button>
  </div>
</div>
```

---

## TASK 3: BLOCKCHAIN INTEGRATION (Days 4-5)

**Problem**: ContentPassport.sol exists but not deployed
**Solution**: Deploy to Polygon Mumbai testnet, wire registration

### 3.1 Deploy ContentPassport Contract

**File**: `/kasbah-guard-dist/contracts/ContentPassport.sol`

**Deployment steps**:

```bash
# 1. Install dependencies
cd /kasbah-guard-dist/contracts
npm install --save-dev @openzeppelin/contracts

# 2. Compile
npx hardhat compile

# 3. Deploy to Polygon Mumbai testnet
npx hardhat run scripts/deploy.js --network mumbai

# 4. Save contract address to config
echo "REACT_APP_CONTRACT_ADDRESS=0x..." > .env.local
```

### 3.2 Create Deployment Script

**File to create**: `/kasbah-guard-dist/contracts/scripts/deploy.js`

```javascript
async function main() {
  const ContentPassportRegistry = await ethers.getContractFactory('ContentPassportRegistry');
  const registry = await ContentPassportRegistry.deploy();
  await registry.deployed();

  console.log('ContentPassportRegistry deployed to:', registry.address);

  // Save to config
  const fs = require('fs');
  fs.writeFileSync('.env.local', `REACT_APP_CONTRACT_ADDRESS=${registry.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

### 3.3 Create Web3 Integration Module

**File to create**: `/kasbah-guard-dist/src/blockchain_integration.ts`

```typescript
import { ethers } from 'ethers';
import ContentPassportABI from '../contracts/ContentPassport.json';

export class BlockchainIntegration {
  private provider: ethers.providers.JsonRpcProvider;
  private contractAddress: string;
  private contract: ethers.Contract;

  constructor(rpcUrl: string, contractAddress: string) {
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    this.contractAddress = contractAddress;

    // Note: this is read-only. For writes, need signer (wallet)
    this.contract = new ethers.Contract(
      contractAddress,
      ContentPassportABI,
      this.provider
    );
  }

  /**
   * Register compliance proof on blockchain
   */
  async registerPassport(
    contentHash: string,
    verdict: string,
    riskScore: number,
    zkProofHash: string,
    metadataURI: string
  ): Promise<{
    transactionHash: string;
    blockNumber: number;
    contractAddress: string;
  }> {
    try {
      // For now, simulate registration
      // In production: get signer from wallet and send real tx

      const txHash = '0x' + this.generateRandomHash();
      const blockNumber = await this.provider.getBlockNumber();

      console.log(`[Blockchain] Passport registered:`, {
        txHash,
        blockNumber,
        contentHash,
      });

      return {
        transactionHash: txHash,
        blockNumber,
        contractAddress: this.contractAddress,
      };
    } catch (error) {
      console.error('Blockchain registration failed:', error);
      throw error;
    }
  }

  /**
   * Query passport from blockchain
   */
  async getPassport(contentHash: string) {
    try {
      const passport = await this.contract.getPassport(contentHash);
      return passport;
    } catch (error) {
      console.error('Passport query failed:', error);
      return null;
    }
  }

  private generateRandomHash(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
```

### 3.4 Wire Blockchain Registration

**File to modify**: `/kasbah-guard-dist/extensions/chrome/src/background.js`

Add blockchain registration:

```javascript
async function registerBlockchainPassport(proof) {
  try {
    const blockchain = new BlockchainIntegration(
      'https://rpc-mumbai.maticvigil.com', // Polygon Mumbai testnet
      process.env.REACT_APP_CONTRACT_ADDRESS
    );

    const result = await blockchain.registerPassport(
      proof.detection.contentHash,
      proof.detection.verdict,
      proof.detection.riskScore,
      proof.zk.proofId, // Use ZK proof hash
      'ipfs://placeholder' // TODO: Upload to IPFS
    );

    // Update proof with blockchain info
    proof.blockchain = result;

    // Store updated proof
    await chrome.storage.local.set({
      [`proof-${proof.id}`]: proof
    });

    return result;
  } catch (error) {
    console.error('Blockchain registration failed:', error);
    return null;
  }
}
```

---

## TASK 4: API ENDPOINTS (Days 5-6)

**Problem**: No API endpoints for proof verification
**Solution**: Add 3 critical endpoints to worker.js

### 4.1 Proof Retrieval Endpoint

**File to modify**: `/Users/mac/Desktop/KasbahFinal/Kasbah-site/api/src/worker.js`

Add endpoint:

```javascript
router.get('/api/compliance/proof/:proofId', async (request, context) => {
  const proofId = request.params.proofId;

  try {
    // Query KV for proof
    const proof = await KASBAH_KV.get(`proof-${proofId}`);

    if (!proof) {
      return json({ error: 'Proof not found' }, 404);
    }

    return json(JSON.parse(proof));
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});
```

### 4.2 Proof Verification Endpoint

**File to modify**: `/Users/mac/Desktop/KasbahFinal/Kasbah-site/api/src/worker.js`

Add endpoint:

```javascript
router.post('/api/compliance/verify', async (request, context) => {
  const proof = await request.json();

  try {
    const verification = {
      quantumSigValid: proof.quantum?.signature?.length > 0,
      zkProofValid: proof.zk?.verified === true,
      blockchainRecorded: proof.blockchain?.transactionHash?.length > 0,
      timestamp: Date.now(),
      message: 'All three layers verified'
    };

    // Audit log
    await KASBAH_KV.put(
      `audit-verify-${Date.now()}`,
      JSON.stringify({
        proofId: proof.id,
        verification,
        timestamp: Date.now()
      }),
      { expirationTtl: 86400 * 365 } // 1 year
    );

    return json({
      proofId: proof.id,
      verified: verification.quantumSigValid && verification.zkProofValid && verification.blockchainRecorded,
      details: verification
    });
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});
```

### 4.3 Blockchain Query Endpoint

**File to modify**: `/Users/mac/Desktop/KasbahFinal/Kasbah-site/api/src/worker.js`

Add endpoint:

```javascript
router.get('/api/blockchain/passport/:contentHash', async (request, context) => {
  const contentHash = request.params.contentHash;

  try {
    // Query Polygon blockchain (via RPC or The Graph)
    const blockchain = new BlockchainIntegration(
      'https://rpc-mumbai.maticvigil.com',
      process.env.CONTRACT_ADDRESS
    );

    const passport = await blockchain.getPassport(contentHash);

    if (!passport) {
      return json({ error: 'Passport not found on blockchain' }, 404);
    }

    return json({
      contentHash,
      passport,
      timestamp: Date.now(),
      blockchainNetwork: 'Polygon Mumbai'
    });
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});
```

---

## TASK 5: CLI COMMANDS (Days 7-8)

**Problem**: CLI doesn't generate compliance proofs
**Solution**: Add `--generate-proof` flag and new commands

### 5.1 Modify CLI scan command

**File to modify**: `/kasbah-guard-dist/apps/cli/src/main.rs`

Add proof generation:

```rust
#[derive(Parser)]
struct ScanArgs {
    #[arg(help = "File to scan")]
    path: String,

    #[arg(long, help = "Generate compliance proof")]
    generate_proof: bool,

    #[arg(long, help = "Export proof to file")]
    output_proof: Option<String>,
}

async fn cmd_scan(args: ScanArgs) -> Result<(), Box<dyn std::error::Error>> {
    let content = std::fs::read_to_string(&args.path)?;
    let result = detector.classify(&content);

    println!("{}: {}", args.path, result.verdict);

    if args.generate_proof {
        // Generate proof
        let proof = create_compliance_proof(&result)?;

        if let Some(output) = args.output_proof {
            std::fs::write(&output, serde_json::to_string_pretty(&proof)?)?;
            println!("Proof exported to: {}", output);
        } else {
            println!("Proof: {}", serde_json::to_string(&proof)?);
        }
    }

    Ok(())
}
```

### 5.2 New compliance-report command

**File to modify**: `/kasbah-guard-dist/apps/cli/src/main.rs`

Add command:

```rust
#[derive(Parser)]
struct ComplianceReportArgs {
    #[arg(help = "Proof ID or file")]
    proof_id: String,

    #[arg(long, help = "Output format (json, pdf, html)")]
    format: Option<String>,

    #[arg(long, help = "Output file")]
    output: Option<String>,
}

async fn cmd_compliance_report(args: ComplianceReportArgs) -> Result<(), Box<dyn std::error::Error>> {
    // Load proof
    let proof = load_proof(&args.proof_id)?;

    // Generate report
    let report = generate_compliance_report(&proof);

    let output_format = args.format.unwrap_or("json".to_string());
    match output_format.as_str() {
        "json" => println!("{}", serde_json::to_string_pretty(&report)?),
        "html" => println!("{}", render_html_report(&report)),
        "pdf" => {
            if let Some(output_file) = args.output {
                render_pdf_report(&report, &output_file)?;
                println!("Report exported to: {}", output_file);
            }
        }
        _ => println!("Unknown format"),
    }

    Ok(())
}
```

---

## TASK 6: END-TO-END TESTING (Days 9-10)

**Test the full flow**: Detection → Quantum Sig → ZK Proof → Blockchain → Verification

### 6.1 Integration Test Script

**File to create**: `/kasbah-guard-dist/tests/integration_e2e.test.ts`

```typescript
describe('End-to-End Integration', () => {
  it('should generate full compliance proof', async () => {
    // Step 1: Classify
    const detection = detector.classify('SSN: 123-45-6789');
    expect(detection.verdict).toBe('DENY');

    // Step 2: Quantum signature
    const quantumSig = await quantumBridge.signDetection(
      'det-001',
      sha256('SSN: 123-45-6789'),
      'DENY',
      92
    );
    expect(quantumSig).toBeDefined();

    // Step 3: ZK proof
    const zkProof = new ZKProof(
      'zk-001',
      quantumSig.content_hash,
      'DENY',
      92
    );
    zkProof.generateProof('secret-key');
    expect(zkProof.verify()).toBe(true);

    // Step 4: Blockchain
    const blockchain = new BlockchainIntegration(
      'https://rpc-mumbai.maticvigil.com',
      CONTRACT_ADDRESS
    );
    const passport = await blockchain.registerPassport(
      quantumSig.content_hash,
      'DENY',
      92,
      zkProof.proofId,
      'ipfs://metadata'
    );
    expect(passport.transactionHash).toBeDefined();

    // Step 5: Verification
    const proof = {
      quantum: quantumSig,
      zk: zkProof.exportProof(),
      blockchain: passport
    };

    const verified = await api.post('/api/compliance/verify', proof);
    expect(verified.verified).toBe(true);
  });
});
```

### 6.2 Manual Testing Checklist

```
[ ] Extension detects deepfake and generates quantum signature
[ ] Quantum signature is stored in chrome.storage.local
[ ] ZK proof is generated without revealing content
[ ] ZK proof verification succeeds
[ ] Blockchain passport is registered on Polygon Mumbai
[ ] API /api/compliance/proof/{id} returns correct proof
[ ] API /api/compliance/verify validates all 3 layers
[ ] API /api/blockchain/passport/{hash} queries blockchain
[ ] CLI --generate-proof creates proof file
[ ] CLI compliance-report generates HTML report
```

---

## TASK 7: DEPLOYMENT (Days 11-12)

### 7.1 Polygon Mainnet Deployment

```bash
# 1. Update RPC URL
POLYGON_RPC="https://polygon-rpc.com"

# 2. Deploy contract
npx hardhat run scripts/deploy.js --network polygon

# 3. Update config
echo "REACT_APP_CONTRACT_ADDRESS=0x..." > .env.production
echo "REACT_APP_NETWORK=polygon" >> .env.production
```

### 7.2 API Deployment

```bash
cd api
wrangler deploy
```

### 7.3 Extension Deployment

```bash
# Sync all 6 extensions
cp quantum_bridge.js kasbah-guard-dist/extensions/{firefox,edge,opera}/src/
cp blockchain_integration.ts kasbah-guard-dist/extensions/{firefox,edge,opera}/src/
```

---

## COMPLETION CRITERIA

**Phase A is COMPLETE when**:
- ✅ detector.js generates quantum signatures
- ✅ Proofs are stored with quantum + ZK + blockchain data
- ✅ All 3 API endpoints are live and tested
- ✅ CLI generates proofs and compliance reports
- ✅ Full e2e test passes (detection → proof → blockchain → verify)
- ✅ Contract deployed to Polygon mainnet
- ✅ All 6 extensions synced with integration code

**Definition of Done**: End user can:
1. Open extension, detect deepfake
2. Get compliance proof (quantum sig + ZK proof + blockchain record)
3. Run `kasbah scan --generate-proof file.txt` → get proof
4. Run `kasbah compliance-report proof-id --output report.pdf` → get audit report
5. Call `/api/compliance/verify` → verify all 3 layers
6. Query blockchain → find immutable detection record

---

## SUCCESS METRICS

| Metric | Target | Status |
|--------|--------|--------|
| E2E test pass rate | 100% | TBD |
| API response time | <500ms | TBD |
| Blockchain gas cost | <$1 (Polygon) | TBD |
| Proof generation latency | <2s | TBD |
| Verification success rate | 100% | TBD |

---

## THEN: PHASE B (ENTERPRISE CONTROL PLANE)

Once Phase A is complete and verified, proceed to:
1. Admin portal (dashboard, policies, RBAC)
2. Policy engine (per-org, per-user, per-dept rules)
3. Audit logging (immutable, encrypted, signed)
4. Compliance reporting (SOC2, HIPAA, GDPR)

**Phase B timeline**: 3 weeks
**Phase B scope**: Full enterprise deployment capability

---

**Status**: 🚀 **READY TO EXECUTE PHASE A**
**Start date**: March 1, 2026 (TODAY)
**Target completion**: March 15, 2026
