/**
 * Kasbah Guard — Slack Guard
 * 
 * Slack app for real-time message scanning.
 * Detects secrets, PII, and sensitive data before messages are sent.
 * 
 * Usage: node src/index.js
 */

require('dotenv').config();
const { App, LogLevel } = require('@slack/bolt');
const { scan, redact } = require('./detector');
const logger = require('./logger');

// Configuration
const CONFIG = {
  appToken: process.env.SLACK_APP_TOKEN,
  botToken: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  port: process.env.PORT || 3000,
  modes: {
    STRICT: { minRisk: 30, action: 'block' },
    MODERATE: { minRisk: 50, action: 'warn' },
    RELAXED: { minRisk: 70, action: 'log' }
  }
};

// Initialize Slack app (Socket Mode)
const app = new App({
  token: CONFIG.botToken,
  appToken: CONFIG.appToken,
  socketMode: true,
  logLevel: LogLevel.INFO,
  logger: {
    debug: (msg) => logger.debug(msg),
    info: (msg) => logger.info(msg),
    warn: (msg) => logger.warn(msg),
    error: (msg) => logger.error(msg)
  }
});

// Server configurations (in-memory, use DB in production)
const serverConfigs = new Map();
const auditLog = [];

// Default server config
function getServerConfig(teamId) {
  if (!serverConfigs.has(teamId)) {
    serverConfigs.set(teamId, {
      mode: 'MODERATE',
      channels: {},
      users: {},
      auditEnabled: true
    });
  }
  return serverConfigs.get(teamId);
}

// Log audit event
function logAudit(event) {
  auditLog.push({
    timestamp: Date.now(),
    ...event
  });
  
  if (auditLog.length > 1000) {
    auditLog.shift();
  }
  
  logger.info('Audit event', event);
}

// Check message for violations
async function checkMessage({ message, say, client, context }) {
  // Ignore bot messages
  if (message.bot_id) return;
  
  // Ignore messages without text
  if (!message.text) return;
  
  const config = getServerConfig(context.teamId);
  
  // Check if channel is excluded
  if (config.channels[message.channel] && config.channels[message.channel].excluded) {
    return;
  }
  
  // Scan the message
  const result = scan(message.text);
  
  if (result.risk === 0) return;
  
  // Log the detection
  logAudit({
    type: 'detection',
    teamId: context.teamId,
    channelId: message.channel,
    userId: message.user,
    messageId: message.ts,
    risk: result.risk,
    decision: result.decision,
    violations: result.violations
  });
  
  const modeConfig = CONFIG.modes[config.mode];
  
  // Take action based on risk and mode
  if (result.risk >= modeConfig.minRisk) {
    await takeAction({ message, result, modeConfig, say, client, context });
  }
}

// Take action based on detection
async function takeAction({ message, result, modeConfig, say, client, context }) {
  switch (modeConfig.action) {
    case 'block':
      try {
        // Delete the message
        await client.chat.delete({
          channel: message.channel,
          ts: message.ts
        });
        
        // Send DM to user
        await client.conversations.open({
          users: message.user
        }).then(async (dm) => {
          await client.chat.postMessage({
            channel: dm.channel.id,
            blocks: createViolationBlocks(result, 'blocked')
          });
        });
        
        // Notify mods in channel
        await client.chat.postMessage({
          channel: message.channel,
          blocks: createModAlertBlocks(result, message)
        });
        
        logAudit({
          type: 'action',
          action: 'block',
          teamId: context.teamId,
          channelId: message.channel,
          userId: message.user,
          messageId: message.ts
        });
      } catch (error) {
        logger.error('Failed to block message', error);
      }
      break;
      
    case 'warn':
      try {
        // Send warning DM
        await client.conversations.open({
          users: message.user
        }).then(async (dm) => {
          await client.chat.postMessage({
            channel: dm.channel.id,
            blocks: createViolationBlocks(result, 'warned')
          });
        });
        
        logAudit({
          type: 'action',
          action: 'warn',
          teamId: context.teamId,
          channelId: message.channel,
          userId: message.user,
          messageId: message.ts
        });
      } catch (error) {
        logger.error('Failed to warn user', error);
      }
      break;
      
    case 'log':
      logAudit({
        type: 'action',
        action: 'log',
        teamId: context.teamId,
        channelId: message.channel,
        userId: message.user,
        messageId: message.ts
      });
      break;
  }
}

// Create violation blocks for DM
function createViolationBlocks(result, actionType) {
  const violation = result.violations[0];
  
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: actionType === 'blocked' ? '🛑 Message Blocked' : '⚠️ Security Warning',
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${violation.type.toUpperCase()} Detected*\n\nRisk Level: *${result.risk}/100*`
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Type:* ${violation.type}\n*Detection:* ${violation.pattern}`
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*What to do:*\n• Never share sensitive data in Slack\n• Rotate any exposed credentials immediately\n• Contact your security team if unsure`
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Kasbah Guard Slack Security'
        }
      ]
    }
  ];
}

// Create mod alert blocks
function createModAlertBlocks(result, message) {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🚨 Security Alert',
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `A message in <#${message.channel}> was blocked due to sensitive data detection.`
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*User:*\n<@${message.user}>`
        },
        {
          type: 'mrkdwn',
          text: `*Risk Level:*\n${result.risk}/100`
        },
        {
          type: 'mrkdwn',
          text: `*Violations:*\n${result.violations.map(v => v.type).join(', ')}`
        }
      ]
    }
  ];
}

// Event listeners
app.message(async ({ message, say, client, context }) => {
  try {
    await checkMessage({ message, say, client, context });
  } catch (error) {
    logger.error('Error checking message', error);
  }
});

// Slash command: /kasbah
app.command('/kasbah', async ({ command, ack, respond, client, context }) => {
  await ack();
  
  const args = command.text.trim().split(/\s+/);
  const subcommand = args[0]?.toLowerCase();
  
  try {
    switch (subcommand) {
      case 'help':
        await respond({
          blocks: createHelpBlocks()
        });
        break;
        
      case 'config':
        if (!await isAdmin(command.user_id, client, context.teamId)) {
          return respond({ text: '❌ You need administrator permissions.' });
        }
        await handleConfigCommand(command, respond, context.teamId);
        break;
        
      case 'audit':
        if (!await isAdmin(command.user_id, client, context.teamId)) {
          return respond({ text: '❌ You need administrator permissions.' });
        }
        await handleAuditCommand(respond, context.teamId);
        break;
        
      case 'stats':
        await handleStatsCommand(respond, context.teamId);
        break;
        
      case 'scan':
        const text = command.text.replace('/kasbah scan', '').trim();
        if (!text) {
          return respond({ text: 'Usage: `/kasbah scan <text>`' });
        }
        const result = scan(text);
        await respond({
          blocks: createScanResultBlocks(result, text)
        });
        break;
        
      default:
        await respond({
          text: `Unknown command. Use \`/kasbah help\` for available commands.`
        });
    }
  } catch (error) {
    logger.error('Command error', error);
    await respond({ text: '❌ An error occurred while processing the command.' });
  }
});

// Check if user is admin
async function isAdmin(userId, client, teamId) {
  try {
    const member = await client.users.info({ user: userId });
    return member.user.is_admin || member.user.is_owner;
  } catch {
    return false;
  }
}

// Help blocks
function createHelpBlocks() {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🛡️ Kasbah Guard - Help',
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Available Commands:*\n' +
          '• `/kasbah help` - Show this help\n' +
          '• `/kasbah config` - View server configuration\n' +
          '• `/kasbah config set <key> <value>` - Update configuration\n' +
          '• `/kasbah audit` - View recent detections\n' +
          '• `/kasbah stats` - Show statistics\n' +
          '• `/kasbah scan <text>` - Test text for sensitive data'
      }
    }
  ];
}

// Config command
async function handleConfigCommand(command, respond, teamId) {
  const config = getServerConfig(teamId);
  const args = command.text.trim().split(/\s+/);
  
  if (args[1] !== 'set') {
    await respond({
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '📋 Server Configuration', emoji: true }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Mode:*\n${config.mode}` },
            { type: 'mrkdwn', text: `*Audit Enabled:*\n${config.auditEnabled ? '✅' : '❌'}` }
          ]
        }
      ]
    });
    return;
  }
  
  const key = args[2];
  const value = args[3];
  
  if (key === 'mode' && ['STRICT', 'MODERATE', 'RELAXED'].includes(value.toUpperCase())) {
    config.mode = value.toUpperCase();
    await respond({ text: `✅ Configuration updated: mode = ${value.toUpperCase()}` });
  } else {
    await respond({ text: 'Unknown configuration. Use `/kasbah config` to view current settings.' });
  }
}

// Audit command
async function handleAuditCommand(respond, teamId) {
  const recentAudit = auditLog
    .filter(e => e.teamId === teamId)
    .slice(-10)
    .reverse();
  
  if (recentAudit.length === 0) {
    await respond({ text: 'No recent audit events.' });
    return;
  }
  
  await respond({
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📋 Recent Audit Log', emoji: true }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: recentAudit.map(e => 
            `• ${new Date(e.timestamp).toLocaleTimeString()} - ${e.type} (${e.action || 'detection'}) - Risk: ${e.risk}`
          ).join('\n')
        }
      }
    ]
  });
}

// Stats command
async function handleStatsCommand(respond, teamId) {
  const teamAudit = auditLog.filter(e => e.teamId === teamId);
  const detections = teamAudit.filter(e => e.type === 'detection');
  
  await respond({
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📊 Statistics', emoji: true }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Total Detections:*\n${detections.length}` },
          { type: 'mrkdwn', text: `*Avg Risk Score:*\n${detections.length ? Math.round(detections.reduce((sum, e) => sum + e.risk, 0) / detections.length) : 0}` }
        ]
      }
    ]
  });
}

// Scan result blocks
function createScanResultBlocks(result, text) {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: result.decision === 'DENY' ? '🛑 DENY' : result.decision === 'WARN' ? '⚠️ WARN' : '✅ ALLOW',
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Risk Score:* ${result.risk}/100\n*Reason:* ${result.reason}`
      }
    },
    ...(result.violations.length > 0 ? [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Violations:*\n${result.violations.map(v => `• ${v.type} (${v.pattern})`).join('\n')}`
      }
    }] : [])
  ];
}

// Error handling
app.error(async (error) => {
  logger.error('App error', error);
});

// Start the app
(async () => {
  try {
    await app.start(CONFIG.port);
    logger.info(`⚡️ Slack Guard running on port ${CONFIG.port}`);
  } catch (error) {
    logger.error('Failed to start app', error);
    process.exit(1);
  }
})();

module.exports = { app, checkMessage, scan };
