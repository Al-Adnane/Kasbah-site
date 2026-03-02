/**
 * Kasbah Guard: ContentPassport Smart Contract Deployment Script v1.0.0
 *
 * Deploys the ContentPassportRegistry to Polygon (Mumbai testnet or mainnet)
 *
 * Usage:
 *   Deploy to Mumbai: npx hardhat run scripts/deploy.js --network mumbai
 *   Deploy to Polygon: npx hardhat run scripts/deploy.js --network polygon
 *
 * Requirements:
 *   - .env file with PRIVATE_KEY set
 *   - Sufficient MATIC in deployment account
 */

const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting ContentPassport Smart Contract Deployment...\n");

  // Get network information
  const network = await ethers.provider.getNetwork();
  console.log(`📡 Network: ${network.name} (Chain ID: ${network.chainId})`);

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`💼 Deployer: ${deployer.address}`);

  // Check balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} MATIC\n`);

  // Validate balance
  if (balance === 0n) {
    throw new Error("❌ Deployer account has 0 MATIC. Please fund it first.");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Compile Contract
  // ─────────────────────────────────────────────────────────────────────────
  console.log("📦 Compiling ContentPassportRegistry...");
  const ContentPassportRegistry = await ethers.getContractFactory(
    "ContentPassportRegistry"
  );
  console.log("✅ Compilation successful\n");

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Deploy Contract
  // ─────────────────────────────────────────────────────────────────────────
  console.log("🔥 Deploying ContentPassportRegistry...");
  const registry = await ContentPassportRegistry.deploy();
  await registry.waitForDeployment();

  const contractAddress = await registry.getAddress();
  console.log(`✅ Deployment successful!`);
  console.log(`📍 Contract Address: ${contractAddress}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Verify Deployment
  // ─────────────────────────────────────────────────────────────────────────
  console.log("🔍 Verifying contract...");

  try {
    const code = await ethers.provider.getCode(contractAddress);
    if (code.length > 2) {
      console.log("✅ Contract verified on blockchain\n");
    } else {
      throw new Error("Contract code not found on blockchain");
    }
  } catch (error) {
    console.log("⚠️  Verification check failed:", error.message, "\n");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: Save Configuration
  // ─────────────────────────────────────────────────────────────────────────
  console.log("💾 Saving configuration...");

  // Create deployment record
  const deploymentRecord = {
    timestamp: new Date().toISOString(),
    network: network.name,
    chainId: network.chainId,
    contractAddress: contractAddress,
    deployer: deployer.address,
    version: "1.0.0",
    verification: {
      status: "deployed",
      blockExplorerUrl:
        network.chainId === 80001
          ? `https://mumbai.polygonscan.com/address/${contractAddress}`
          : `https://polygonscan.com/address/${contractAddress}`,
    },
  };

  // Save to .env.local
  const envContent = `REACT_APP_CONTRACT_ADDRESS=${contractAddress}\nREACT_APP_NETWORK=${network.name}\n`;
  fs.writeFileSync(path.join(__dirname, "../.env.local"), envContent);
  console.log("✅ Saved to .env.local\n");

  // Save to deployment record
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const deploymentFile = path.join(
    deploymentsDir,
    `${network.name}-${Date.now()}.json`
  );
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentRecord, null, 2));
  console.log(`✅ Saved deployment record to ${deploymentFile}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5: Post-Deployment Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════");
  console.log("   KASBAH GUARD BLOCKCHAIN PASSPORT DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log(`Network:     ${network.name} (Chain ${network.chainId})`);
  console.log(`Contract:    ContentPassportRegistry`);
  console.log(`Address:     ${contractAddress}`);
  console.log(`Deployer:    ${deployer.address}\n`);

  console.log("Next steps:");
  console.log(
    `1. Verify contract on ${deploymentRecord.verification.blockExplorerUrl}`
  );
  console.log(`2. Update extension with CONTRACT_ADDRESS=${contractAddress}`);
  console.log(
    `3. Test registerPassport() to create first content passport\n`
  );

  return deploymentRecord;
}

// Error handling
main().catch((error) => {
  console.error("❌ Deployment failed!");
  console.error(error);
  process.exitCode = 1;
});
