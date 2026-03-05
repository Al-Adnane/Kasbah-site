import { MongoClient } from 'mongodb';

/**
 * Kasbah Guard — Database Layer
 * 
 * MongoDB database for Discord Guardian and Slack Guard.
 * Provides persistent storage for detections, server configs, and audit logs.
 */

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'kasbah-guard';

let client = null;
let db = null;

/**
 * Initialize database connection
 */
export async function initDatabase() {
  if (db) return db;
  
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    
    // Create indexes for performance
    await createIndexes();
    
    console.log('[Database] Connected to MongoDB');
    return db;
  } catch (error) {
    console.error('[Database] Failed to connect:', error.message);
    throw error;
  }
}

/**
 * Create database indexes
 */
async function createIndexes() {
  // Detections collection
  await db.collection('detections').createIndex({ timestamp: -1 });
  await db.collection('detections').createIndex({ serverId: 1, timestamp: -1 });
  await db.collection('detections').createIndex({ userId: 1, timestamp: -1 });
  await db.collection('detections').createIndex({ risk: -1 });
  
  // Servers/Workspaces collection
  await db.collection('servers').createIndex({ serverId: 1 }, { unique: true });
  await db.collection('workspaces').createIndex({ teamId: 1 }, { unique: true });
  
  // Users collection
  await db.collection('users').createIndex({ userId: 1 }, { unique: true });
  await db.collection('users').createIndex({ lastActive: -1 });
  
  // Audit logs
  await db.collection('audit').createIndex({ timestamp: -1 });
  await db.collection('audit').createIndex({ serverId: 1, timestamp: -1 });
}

/**
 * Detection operations
 */
export async function saveDetection(detection) {
  const result = await db.collection('detections').insertOne({
    ...detection,
    timestamp: Date.now(),
    createdAt: new Date()
  });
  return result.insertedId;
}

export async function getDetections(filter = {}, limit = 100) {
  const query = { ...filter };
  if (filter.serverId) query.serverId = filter.serverId;
  if (filter.userId) query.userId = filter.userId;
  if (filter.minRisk) query.risk = { $gte: filter.minRisk };
  
  return await db.collection('detections')
    .find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}

export async function getDetectionStats(serverId, days = 7) {
  const since = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  const stats = await db.collection('detections').aggregate([
    { $match: { serverId, timestamp: { $gte: since } } },
    {
      $group: {
        _id: '$decision',
        count: { $sum: 1 },
        avgRisk: { $avg: '$risk' }
      }
    }
  ]).toArray();
  
  return stats;
}

/**
 * Server/Workspace configuration operations
 */
export async function getServerConfig(serverId) {
  return await db.collection('servers').findOne({ serverId });
}

export async function updateServerConfig(serverId, config) {
  const result = await db.collection('servers').updateOne(
    { serverId },
    { 
      $set: { 
        ...config, 
        updatedAt: Date.now(),
        serverId 
      } 
    },
    { upsert: true }
  );
  return result.modifiedCount > 0 || result.upsertedCount > 0;
}

export async function getWorkspaceConfig(teamId) {
  return await db.collection('workspaces').findOne({ teamId });
}

export async function updateWorkspaceConfig(teamId, config) {
  const result = await db.collection('workspaces').updateOne(
    { teamId },
    { 
      $set: { 
        ...config, 
        updatedAt: Date.now(),
        teamId 
      } 
    },
    { upsert: true }
  );
  return result.modifiedCount > 0 || result.upsertedCount > 0;
}

/**
 * User operations
 */
export async function getUser(userId) {
  return await db.collection('users').findOne({ userId });
}

export async function updateUser(userId, data) {
  const result = await db.collection('users').updateOne(
    { userId },
    { 
      $set: { 
        ...data, 
        lastActive: Date.now(),
        userId 
      } 
    },
    { upsert: true }
  );
  return result.modifiedCount > 0 || result.upsertedCount > 0;
}

/**
 * Audit log operations
 */
export async function saveAuditLog(entry) {
  const result = await db.collection('audit').insertOne({
    ...entry,
    timestamp: Date.now(),
    createdAt: new Date()
  });
  return result.insertedId;
}

export async function getAuditLogs(serverId, limit = 100) {
  return await db.collection('audit')
    .find({ serverId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Cleanup old data (retention policy)
 */
export async function cleanupOldData(days = 90) {
  const before = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  const detectionResult = await db.collection('detections')
    .deleteMany({ timestamp: { $lt: before } });
  
  const auditResult = await db.collection('audit')
    .deleteMany({ timestamp: { $lt: before } });
  
  return {
    detectionsDeleted: detectionResult.deletedCount,
    auditDeleted: auditResult.deletedCount
  };
}

/**
 * Close database connection
 */
export async function closeDatabase() {
  if (client) {
    await client.close();
    console.log('[Database] Connection closed');
  }
}

// Auto-initialize on import
initDatabase().catch(err => {
  console.error('[Database] Auto-init failed:', err.message);
});
