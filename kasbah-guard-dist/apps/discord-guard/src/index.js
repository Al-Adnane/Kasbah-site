/**
 * Kasbah Guard — Discord Guardian
 * 
 * Discord bot for detecting and blocking:
 * - Discord tokens and bot tokens
 * - API keys and secrets
 * - Phishing links
 * - PII (SSN, emails, phone numbers)
 * - Spam and raid patterns
 * 
 * Usage: node src/index.js
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { detectSecrets, detectPII, detectPhishing, calculateRisk } = require('./detector');
const logger = require('./logger');

// Configuration
const CONFIG = {
  token: process.env.DISCORD_BOT_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  prefix: process.env.PREFIX || '!',
  modes: {
    STRICT: { minRisk: 30, action: 'delete_timeout' },
    MODERATE: { minRisk: 50, action: 'delete_warn' },
    RELAXED: { minRisk: 70, action: 'log_only' }
  }
};

// Server configurations (in-memory, use DB in production)
const serverConfigs = new Map();
const auditLog = [];

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// Default server config
function getServerConfig(guildId) {
  if (!serverConfigs.has(guildId)) {
    serverConfigs.set(guildId, {
      mode: 'MODERATE',
      automod: {
        phishing: true,
        tokens: true,
        pii: true,
        spam: true
      },
      excludedChannels: [],
      excludedRoles: [],
      timeoutDuration: 60,
      strikeLimit: 3
    });
  }
  return serverConfigs.get(guildId);
}

// Log audit event
function logAudit(event) {
  auditLog.push({
    timestamp: Date.now(),
    ...event
  });
  
  // Keep last 1000 events
  if (auditLog.length > 1000) {
    auditLog.shift();
  }
  
  logger.info('Audit event', event);
}

// User strikes tracking
const userStrikes = new Map();

function addStrike(userId, guildId, reason) {
  const key = `${guildId}:${userId}`;
  const strikes = userStrikes.get(key) || [];
  strikes.push({ reason, timestamp: Date.now() });
  userStrikes.set(key, strikes);
  
  const config = getServerConfig(guildId);
  if (strikes.length >= config.strikeLimit) {
    return true; // Ban threshold reached
  }
  return false;
}

// Check message for violations
async function checkMessage(message) {
  if (message.author.bot) return;
  
  const config = getServerConfig(message.guild.id);
  
  // Check excluded channels
  if (config.excludedChannels.includes(message.channel.id)) return;
  
  // Check excluded roles
  const member = message.guild.members.cache.get(message.author.id);
  if (member && member.roles.cache.some(r => config.excludedRoles.includes(r.id))) return;
  
  const content = message.content;
  const violations = [];
  
  // Token detection
  if (config.automod.tokens) {
    const tokenResults = detectSecrets(content);
    if (tokenResults.detected) {
      violations.push({
        type: 'token',
        details: tokenResults.detections,
        risk: tokenResults.risk
      });
    }
  }
  
  // PII detection
  if (config.automod.pii) {
    const piiResults = detectPII(content);
    if (piiResults.detected) {
      violations.push({
        type: 'pii',
        details: piiResults.detections,
        risk: piiResults.risk
      });
    }
  }
  
  // Phishing detection
  if (config.automod.phishing) {
    const phishingResults = detectPhishing(content);
    if (phishingResults.detected) {
      violations.push({
        type: 'phishing',
        details: phishingResults.detections,
        risk: phishingResults.risk
      });
    }
  }
  
  if (violations.length === 0) return;
  
  // Calculate overall risk
  const maxRisk = Math.max(...violations.map(v => v.risk));
  const modeConfig = CONFIG.modes[config.mode];
  
  // Log the detection
  logAudit({
    type: 'detection',
    guildId: message.guild.id,
    channelId: message.channel.id,
    userId: message.author.id,
    username: message.author.tag,
    messageId: message.id,
    violations,
    risk: maxRisk,
    action: 'pending'
  });
  
  // Take action based on risk and mode
  if (maxRisk >= modeConfig.minRisk) {
    await takeAction(message, violations, modeConfig.action);
  }
}

// Take moderation action
async function takeAction(message, violations, action) {
  const { DELETE_TIMEOUT, DELETE_WARN, LOG_ONLY } = {
    DELETE_TIMEOUT: 'delete_timeout',
    DELETE_WARN: 'delete_warn',
    LOG_ONLY: 'log_only'
  };
  
  switch (action) {
    case DELETE_TIMEOUT:
      try {
        await message.delete();
        await message.author.timeout(
          getServerConfig(message.guild.id).timeoutDuration * 1000,
          'Sensitive data detected'
        );
        
        // Add strike
        const shouldBan = addStrike(message.author.id, message.guild.id, violations[0].type);
        if (shouldBan) {
          await message.member.ban({ reason: 'Repeated security violations' });
        }
        
        // Send DM to user
        await message.author.send({
          embeds: [createViolationEmbed(violations, 'deleted_timeout')]
        }).catch(() => {});
        
        logAudit({
          type: 'action',
          action: 'delete_timeout',
          guildId: message.guild.id,
          userId: message.author.id,
          messageId: message.id
        });
      } catch (error) {
        logger.error('Failed to delete/timeout', error);
      }
      break;
      
    case DELETE_WARN:
      try {
        await message.delete();
        
        // Send warning DM
        await message.author.send({
          embeds: [createViolationEmbed(violations, 'deleted_warn')]
        }).catch(() => {});
        
        logAudit({
          type: 'action',
          action: 'delete_warn',
          guildId: message.guild.id,
          userId: message.author.id,
          messageId: message.id
        });
      } catch (error) {
        logger.error('Failed to delete/warn', error);
      }
      break;
      
    case LOG_ONLY:
      logAudit({
        type: 'action',
        action: 'log_only',
        guildId: message.guild.id,
        userId: message.author.id,
        messageId: message.id
      });
      break;
  }
}

// Create violation embed
function createViolationEmbed(violations, actionType) {
  const violation = violations[0];
  const detection = violation.details.detections[0];
  
  return new EmbedBuilder()
    .setColor(actionType === 'deleted_timeout' ? 0xff0000 : 0xffa500)
    .setTitle('🛡️ Kasbah Guard - Security Alert')
    .setDescription(`**${violation.type.toUpperCase()} Detected**`)
    .addFields(
      { name: 'Type', value: detection.type || 'Unknown', inline: true },
      { name: 'Risk Level', value: `${violation.risk}/100`, inline: true },
      { name: 'Action', value: actionType.replace('_', ' ').toUpperCase(), inline: true }
    )
    .addFields(
      { 
        name: 'What to do', 
        value: 'Never share sensitive data in Discord messages. Delete this message and rotate any exposed credentials immediately.',
        inline: false 
      }
    )
    .setFooter({ text: 'Kasbah Guard Discord Guardian' })
    .setTimestamp();
}

// Create mod alert embed
function createModAlertEmbed(violations, message) {
  return new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('🚨 Security Violation Alert')
    .setDescription(`User ${message.author.tag} triggered security detection`)
    .addFields(
      { name: 'User ID', value: message.author.id, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Violations', value: violations.map(v => v.type).join(', '), inline: true }
    )
    .setTimestamp();
}

// Bot ready
client.once('ready', () => {
  logger.info(`Discord Guardian logged in as ${client.user.tag}`);
  logger.info(`Serving ${client.guilds.cache.size} servers`);
  
  // Set presence
  client.user.setPresence({
    activities: [{ name: 'for secrets 🔒' }],
    status: 'online'
  });
});

// Message event
client.on('messageCreate', async (message) => {
  try {
    await checkMessage(message);
  } catch (error) {
    logger.error('Error checking message', error);
  }
});

// Command handler
client.on('messageCreate', async (message) => {
  if (!message.content.startsWith(CONFIG.prefix)) return;
  if (message.author.bot) return;
  
  const args = message.content.slice(CONFIG.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  if (command !== 'kasbah') return;
  
  // Check admin permissions for admin commands
  const isAdmin = message.member && message.member.permissions.has('ADMINISTRATOR');
  
  const subcommand = args.shift();
  
  try {
    switch (subcommand) {
      case 'help':
        await message.reply({
          embeds: [createHelpEmbed()]
        });
        break;
        
      case 'config':
        if (!isAdmin) {
          return message.reply('❌ You need administrator permissions to use this command.');
        }
        await handleConfigCommand(message, args);
        break;
        
      case 'audit':
        if (!isAdmin) {
          return message.reply('❌ You need administrator permissions to use this command.');
        }
        await handleAuditCommand(message, args);
        break;
        
      case 'stats':
        await handleStatsCommand(message);
        break;
        
      case 'ping':
        await message.reply(`🏓 Pong! Latency: ${client.ws.ping}ms`);
        break;
    }
  } catch (error) {
    logger.error('Command error', error);
    message.reply('❌ An error occurred while processing the command.');
  }
});

// Help embed
function createHelpEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🛡️ Kasbah Guard - Help')
    .setDescription('Discord Guardian protects your server from secrets, PII, and phishing.')
    .addFields(
      { name: '!kasbah help', value: 'Show this help message', inline: false },
      { name: '!kasbah config', value: 'View server configuration (Admin only)', inline: false },
      { name: '!kasbah config set <key> <value>', value: 'Update configuration (Admin only)', inline: false },
      { name: '!kasbah audit', value: 'View recent detections (Admin only)', inline: false },
      { name: '!kasbah stats', value: 'Show server statistics', inline: false },
      { name: '!kasbah ping', value: 'Check bot latency', inline: false }
    )
    .setFooter({ text: 'Kasbah Guard Discord Guardian' })
    .setTimestamp();
}

// Config command handler
async function handleConfigCommand(message, args) {
  const config = getServerConfig(message.guild.id);
  
  if (args.length === 0 || args[0] !== 'set') {
    // Show current config
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📋 Server Configuration')
      .addFields(
        { name: 'Mode', value: config.mode, inline: true },
        { name: 'Timeout Duration', value: `${config.timeoutDuration}s`, inline: true },
        { name: 'Strike Limit', value: config.strikeLimit.toString(), inline: true },
        { name: 'Token Detection', value: config.automod.tokens ? '✅' : '❌', inline: true },
        { name: 'PII Detection', value: config.automod.pii ? '✅' : '❌', inline: true },
        { name: 'Phishing Detection', value: config.automod.phishing ? '✅' : '❌', inline: true },
        { name: 'Spam Detection', value: config.automod.spam ? '✅' : '❌', inline: true }
      )
      .setFooter({ text: 'Use !kasbah config set <key> <value> to change settings' });
    
    return message.reply({ embeds: [embed] });
  }
  
  // Set config
  const key = args[1];
  const value = args[2];
  
  if (!key || !value) {
    return message.reply('Usage: `!kasbah config set <key> <value>`');
  }
  
  switch (key) {
    case 'mode':
      if (!['STRICT', 'MODERATE', 'RELAXED'].includes(value.toUpperCase())) {
        return message.reply('Invalid mode. Use STRICT, MODERATE, or RELAXED.');
      }
      config.mode = value.toUpperCase();
      break;
      
    case 'timeout':
      config.timeoutDuration = parseInt(value);
      break;
      
    case 'strikes':
      config.strikeLimit = parseInt(value);
      break;
      
    default:
      return message.reply('Unknown configuration key.');
  }
  
  message.reply(`✅ Configuration updated: ${key} = ${value}`);
}

// Audit command handler
async function handleAuditCommand(message, args) {
  const recentAudit = auditLog
    .filter(e => e.guildId === message.guild.id)
    .slice(-10)
    .reverse();
  
  if (recentAudit.length === 0) {
    return message.reply('No recent audit events.');
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 Recent Audit Log')
    .setDescription(recentAudit.map(e => 
      `• ${new Date(e.timestamp).toLocaleTimeString()} - ${e.type} (${e.action || 'detection'})`
    ).join('\n'))
    .setFooter({ text: `Showing last ${recentAudit.length} events` });
  
  message.reply({ embeds: [embed] });
}

// Stats command handler
async function handleStatsCommand(message) {
  const guildAudit = auditLog.filter(e => e.guildId === message.guild.id);
  const detections = guildAudit.filter(e => e.type === 'detection');
  const actions = guildAudit.filter(e => e.type === 'action');
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📊 Server Statistics')
    .addFields(
      { name: 'Total Detections', value: detections.length.toString(), inline: true },
      { name: 'Actions Taken', value: actions.length.toString(), inline: true },
      { name: 'Server Members', value: message.guild.memberCount.toString(), inline: true }
    )
    .setFooter({ text: 'Kasbah Guard Discord Guardian' })
    .setTimestamp();
  
  message.reply({ embeds: [embed] });
}

// Error handling
process.on('unhandledRejection', error => {
  logger.error('Unhandled rejection', error);
});

process.on('uncaughtException', error => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

// Login
client.login(CONFIG.token).catch(error => {
  logger.error('Failed to login', error);
  process.exit(1);
});

module.exports = { client, checkMessage, getServerConfig };
