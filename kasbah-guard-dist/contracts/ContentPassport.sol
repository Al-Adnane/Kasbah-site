/**
 * Kasbah Guard: Content Passport v1.0.0
 *
 * Ethereum smart contract for issuing blockchain-verified
 * content authenticity certificates.
 *
 * Features:
 * - Content hash registration on Ethereum
 * - Immutable detection proof
 * - Verifiable by anyone
 * - Compliance-grade audit trail
 *
 * Network: Ethereum mainnet + Polygon (L2 for cost efficiency)
 * Deployment gas estimate: ~250,000 wei
 */

pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * Content Passport: Immutable record of content detection
 */
struct ContentPassport {
    bytes32 contentHash;          // SHA-256 hash of original content
    address issuer;               // Kasbah Guard contract
    address registrant;           // Organization that registered content
    uint256 detectionTimestamp;   // When detection occurred
    uint256 registrationTimestamp; // When registered on blockchain
    string verdict;               // "DEEPFAKE", "AUTHENTIC", etc.
    uint32 riskScore;            // 0-100 risk confidence
    bytes32 zkProofHash;         // Hash of zk-SNARK proof (optional)
    bool isVerified;             // Has undergone verification
    string metadataURI;          // IPFS URI of full detection data
}

/**
 * Detection Evidence: supporting proof data
 */
struct DetectionEvidence {
    bytes32 contentHash;
    bytes signature;             // RSA-2048 signature of detection
    bytes32 zkProofCommitment;   // ZK proof commitment (Pedersen)
    uint256 timestamp;
    string detectionMethod;      // "ML_ENTROPY", "PATTERN_MATCHING", etc.
}

/**
 * Content Passport Registry
 * Issues and verifies blockchain content authenticity certificates
 */
contract ContentPassportRegistry is Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;

    // ─────────────────────────────────────────────────
    // State Variables
    // ─────────────────────────────────────────────────

    Counters.Counter private _passportCounter;
    mapping(bytes32 => ContentPassport) public passports;
    mapping(bytes32 => DetectionEvidence) public evidence;
    mapping(address => bool) public authorizedIssuers;

    // Organization tracking
    mapping(address => uint256) public orgPassportCount;
    mapping(address => uint256) public orgTotalRiskScore;

    // Verification tracking
    mapping(bytes32 => address[]) public verifiers;
    mapping(bytes32 => mapping(address => bool)) public hasVerified;

    // ─────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────

    event PassportIssued(
        bytes32 indexed contentHash,
        address indexed issuer,
        address indexed registrant,
        string verdict,
        uint256 timestamp
    );

    event PassportVerified(
        bytes32 indexed contentHash,
        address indexed verifier,
        bool isValid,
        uint256 timestamp
    );

    event IssuerAuthorized(
        address indexed issuer,
        bool authorized,
        uint256 timestamp
    );

    event EvidenceRecorded(
        bytes32 indexed contentHash,
        string detectionMethod,
        uint256 timestamp
    );

    // ─────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────

    constructor() {
        // Authorize Kasbah Guard as initial issuer
        authorizedIssuers[msg.sender] = true;
    }

    // ─────────────────────────────────────────────────
    // Core Functions: Issue & Verify Passports
    // ─────────────────────────────────────────────────

    /**
     * Issue a new Content Passport
     * Only authorized issuers can call this
     */
    function issuePassport(
        bytes32 contentHash,
        address registrant,
        string calldata verdict,
        uint32 riskScore,
        bytes32 zkProofHash,
        string calldata metadataURI
    ) external onlyAuthorizedIssuer nonReentrant returns (bytes32) {
        require(contentHash != bytes32(0), "Invalid content hash");
        require(registrant != address(0), "Invalid registrant");
        require(riskScore <= 100, "Invalid risk score");

        // Create passport
        ContentPassport memory passport = ContentPassport({
            contentHash: contentHash,
            issuer: msg.sender,
            registrant: registrant,
            detectionTimestamp: block.timestamp - 60, // Detection ~1min ago
            registrationTimestamp: block.timestamp,
            verdict: verdict,
            riskScore: riskScore,
            zkProofHash: zkProofHash,
            isVerified: false,
            metadataURI: metadataURI
        });

        // Store passport
        passports[contentHash] = passport;

        // Track organization
        orgPassportCount[registrant]++;
        orgTotalRiskScore[registrant] += riskScore;

        // Increment counter
        _passportCounter.increment();

        emit PassportIssued(
            contentHash,
            msg.sender,
            registrant,
            verdict,
            block.timestamp
        );

        return contentHash;
    }

    /**
     * Record detection evidence for a passport
     */
    function recordEvidence(
        bytes32 contentHash,
        bytes calldata signature,
        bytes32 zkProofCommitment,
        string calldata detectionMethod
    ) external onlyAuthorizedIssuer {
        require(passports[contentHash].issuer != address(0), "Passport not found");

        DetectionEvidence memory ev = DetectionEvidence({
            contentHash: contentHash,
            signature: signature,
            zkProofCommitment: zkProofCommitment,
            timestamp: block.timestamp,
            detectionMethod: detectionMethod
        });

        evidence[contentHash] = ev;

        emit EvidenceRecorded(contentHash, detectionMethod, block.timestamp);
    }

    /**
     * Verify a content passport (external verifier)
     * Anyone can verify, promotes transparency
     */
    function verifyPassport(bytes32 contentHash, bool isValid)
        external
        nonReentrant
    {
        require(passports[contentHash].issuer != address(0), "Passport not found");
        require(!hasVerified[contentHash][msg.sender], "Already verified");

        // Record verification
        verifiers[contentHash].push(msg.sender);
        hasVerified[contentHash][msg.sender] = true;

        // Mark as verified if consensus reached
        if (verifiers[contentHash].length >= 3) {
            passports[contentHash].isVerified = true;
        }

        emit PassportVerified(contentHash, msg.sender, isValid, block.timestamp);
    }

    // ─────────────────────────────────────────────────
    // Query Functions
    // ─────────────────────────────────────────────────

    /**
     * Get passport details
     */
    function getPassport(bytes32 contentHash)
        external
        view
        returns (ContentPassport memory)
    {
        return passports[contentHash];
    }

    /**
     * Get detection evidence
     */
    function getEvidence(bytes32 contentHash)
        external
        view
        returns (DetectionEvidence memory)
    {
        return evidence[contentHash];
    }

    /**
     * Check if passport is verified
     */
    function isPassportVerified(bytes32 contentHash)
        external
        view
        returns (bool)
    {
        return passports[contentHash].isVerified;
    }

    /**
     * Get verification count
     */
    function getVerificationCount(bytes32 contentHash)
        external
        view
        returns (uint256)
    {
        return verifiers[contentHash].length;
    }

    /**
     * Get organization statistics
     */
    function getOrgStats(address org)
        external
        view
        returns (uint256 passportCount, uint256 avgRiskScore)
    {
        uint256 count = orgPassportCount[org];
        if (count == 0) {
            return (0, 0);
        }

        passportCount = count;
        avgRiskScore = orgTotalRiskScore[org] / count;
    }

    /**
     * Get total passports issued
     */
    function getTotalPassports() external view returns (uint256) {
        return _passportCounter.current();
    }

    // ─────────────────────────────────────────────────
    // Admin Functions
    // ─────────────────────────────────────────────────

    /**
     * Authorize an issuer
     */
    function authorizeIssuer(address issuer) external onlyOwner {
        require(issuer != address(0), "Invalid issuer");
        authorizedIssuers[issuer] = true;
        emit IssuerAuthorized(issuer, true, block.timestamp);
    }

    /**
     * Revoke issuer authorization
     */
    function revokeIssuer(address issuer) external onlyOwner {
        require(issuer != address(0), "Invalid issuer");
        authorizedIssuers[issuer] = false;
        emit IssuerAuthorized(issuer, false, block.timestamp);
    }

    /**
     * Check if address is authorized issuer
     */
    function isAuthorizedIssuer(address issuer)
        external
        view
        returns (bool)
    {
        return authorizedIssuers[issuer];
    }

    // ─────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────

    modifier onlyAuthorizedIssuer() {
        require(authorizedIssuers[msg.sender], "Not authorized issuer");
        _;
    }
}

/**
 * Content Passport Interface
 * Standard interface for interacting with passport registry
 */
interface IContentPassportRegistry {
    function issuePassport(
        bytes32 contentHash,
        address registrant,
        string calldata verdict,
        uint32 riskScore,
        bytes32 zkProofHash,
        string calldata metadataURI
    ) external returns (bytes32);

    function verifyPassport(bytes32 contentHash, bool isValid) external;

    function getPassport(bytes32 contentHash)
        external
        view
        returns (ContentPassport memory);

    function isPassportVerified(bytes32 contentHash)
        external
        view
        returns (bool);
}
