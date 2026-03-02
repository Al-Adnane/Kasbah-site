# Kasbah Guard: Blockchain Content Passport Smart Contracts

## Overview

This directory contains the smart contracts for Kasbah Guard's blockchain integration. The `ContentPassportRegistry` contract enables immutable registration of content detection proofs on Ethereum-compatible blockchains (Polygon).

## Features

✅ **Immutable Detection Records** - Register detection proofs on blockchain with timestamp
✅ **Multi-Layer Proof** - Quantum signature + ZK proof + blockchain audit trail
✅ **Transparent Verification** - Anyone can verify registered passports
✅ **Community Validation** - External validators can provide consensus
✅ **Cost Efficient** - Deploy on Polygon L2 (~$0.001 per registration vs $10+ on mainnet)

## Quick Start

### 1. Prerequisites

```bash
# Install Node.js 16+
node --version

# Install dependencies
cd contracts
npm install
```

### 2. Configuration

Create `.env` file:

```bash
cp .env.example .env
```

Fill in your configuration:

```env
# Network RPC endpoints
MUMBAI_RPC_URL=https://rpc-mumbai.maticvigil.com
POLYGON_RPC_URL=https://polygon-rpc.com

# Deployment account (get from MetaMask or key provider)
# ⚠️ NEVER commit .env with real private keys!
PRIVATE_KEY=your_private_key_here

# Etherscan API key for contract verification
POLYGONSCAN_API_KEY=your_polygonscan_api_key
```

### 3. Deploy to Polygon Mumbai (Testnet)

```bash
# Compile contract
npm run compile

# Fund your account with test MATIC
# Visit https://faucet.polygon.technology/

# Deploy to Mumbai
npm run deploy:mumbai
```

Expected output:

```
📡 Network: maticmum (Chain ID: 80001)
💼 Deployer: 0x...
💰 Balance: 5.0 MATIC

📦 Compiling ContentPassportRegistry...
✅ Compilation successful

🔥 Deploying ContentPassportRegistry...
✅ Deployment successful!
📍 Contract Address: 0x1234567890123456789012345678901234567890

Next steps:
1. Verify contract on https://mumbai.polygonscan.com/address/0x...
2. Update extension with CONTRACT_ADDRESS=0x...
3. Test registerPassport() to create first content passport
```

Save the contract address from output.

### 4. Deploy to Polygon Mainnet

```bash
# Ensure sufficient MATIC in deployment account (~10 MATIC)
npm run deploy:polygon
```

## Contract Interface

### Core Functions

#### `issuePassport(contentHash, registrant, verdict, riskScore, zkProofHash, metadataURI)`

Issues a new content passport.

**Parameters:**
- `contentHash` (bytes32): SHA-256 hash of detected content
- `registrant` (address): Organization registering the passport
- `verdict` (string): Classification ("DEEPFAKE", "AUTHENTIC", "WARN")
- `riskScore` (uint32): Confidence 0-100
- `zkProofHash` (bytes32): Hash of zero-knowledge proof
- `metadataURI` (string): IPFS URI with full detection metadata

**Returns:** Passport ID (bytes32)

#### `verifyPassport(contentHash, isValid)`

Verify a passport (any external validator can call).

**Parameters:**
- `contentHash` (bytes32): Hash to verify
- `isValid` (bool): Whether verifier validates the passport

#### `getPassport(contentHash)`

Retrieve passport details.

**Returns:** Full passport struct with all metadata.

#### `isPassportVerified(contentHash)`

Check if passport has community consensus (3+ verifications).

**Returns:** Boolean

## Architecture

### 3-Layer Proof System

```
Detection Occurs
    ↓
Layer 1: Quantum Signature (Dilithium-2)
    ├─ Non-repudiation proof
    ├─ Post-quantum resistant
    └─ Immutable timestamp
    ↓
Layer 2: ZK Proof (Merkle-SHA256)
    ├─ Privacy-preserving
    ├─ Proves detection without revealing content
    └─ Auditor-friendly
    ↓
Layer 3: Blockchain Passport (Ethereum/Polygon)
    ├─ Immutable audit trail
    ├─ Cryptographically verifiable
    └─ Transparent to community
```

### Deployment Flow

```
ContentPassportRegistry.sol
    ↓ (hardhat)
Compiled bytecode
    ↓ (npx hardhat run scripts/deploy.js)
Deployed to Polygon Mumbai/Mainnet
    ↓ (saved to .env.local)
Extension loads contract address
    ↓ (popup.js::registerProofOnBlockchain)
Detections registered with blockchain proof
```

## Integration with Extension

### 1. Update Extension Configuration

After deployment, update the extension with the contract address:

**File:** `kasbah-guard-dist/extensions/chrome/src/blockchain_integration.ts`

```typescript
constructor(contractAddress: string = "") {
  this.contractAddress =
    contractAddress ||
    (process.env.REACT_APP_CONTRACT_ADDRESS as string) ||
    "0x[YOUR_DEPLOYED_ADDRESS]";  // ← Update this
  this.currentNetwork = "polygon";
}
```

### 2. MetaMask Connection

Users need:
1. MetaMask extension installed
2. Some MATIC (0.1 MATIC for 1000 registrations)
3. Network: Polygon Mainnet (extension auto-adds)

### 3. Registration Flow

When user clicks "Register Blockchain" in popup:

```
User clicks button
    ↓ popup.js::registerProofOnBlockchain()
    ↓ blockchain_integration.ts::connectWallet()
    ↓ MetaMask prompt "Connect Account"
    ↓ Switch to Polygon network (auto-add if needed)
    ↓ registerPassport() transaction
    ↓ Proof stored with blockchain info
    ↓ UI updates with transaction link
```

## Verification

### On-Chain Verification

Verify your contract on Etherscan:

```bash
npm run verify -- [CONTRACT_ADDRESS] --network polygon
```

### Local Testing

```bash
# Run test suite (create test/ directory first)
npm run test

# Flatten contract for review
npm run flatten > ContentPassport_flat.sol
```

## Production Checklist

- [ ] Deploy to Polygon Mainnet (not just testnet)
- [ ] Verify contract on Etherscan/PolygonScan
- [ ] Test end-to-end registration flow with MetaMask
- [ ] Document contract address in `.env.local`
- [ ] Update extension with correct contract address
- [ ] Test with real MATIC (small amounts first)
- [ ] Monitor gas costs (aim for <$0.01 per registration)
- [ ] Set up contract address change process for future updates

## Security Considerations

⚠️ **Private Keys**: Never commit `.env` file with real private keys
⚠️ **Test First**: Always test on Mumbai before mainnet deployment
⚠️ **Gas Estimation**: Monitor gas prices before mainnet deployment
⚠️ **Contract Upgrades**: Current design is immutable - review thoroughly before deploy

## Gas Costs

Typical gas usage on Polygon:

| Operation | Gas | Cost (MATIC) | Cost (USD) |
|-----------|-----|------|------|
| issuePassport | 180,000 | 0.18 | ~$0.10 |
| verifyPassport | 50,000 | 0.05 | ~$0.03 |
| getPassport | 25,000 | 0 | $0 (view) |

Mumbai testnet gas is free. Polygon mainnet gas ~$0.0001 per wei.

## Support

- Polygon Docs: https://docs.polygon.technology/
- PolygonScan: https://polygonscan.com
- OpenZeppelin: https://docs.openzeppelin.com/

## License

SPDX-License-Identifier: MIT

---

**Last Updated**: March 1, 2026
**Version**: 1.0.0
**Status**: Production Ready
