/**
 * Kasbah Guard — Slack Guard
 * 
 * Real-time message scanning for Slack workspaces
 * Blocks secrets, PII, and sensitive data before sending
 */

const { App } = require('@slack/bolt');
const { scan, redact } = require('@kasbah/detector');

class SlackGuard {
  constructor(config) {
    this.config = config;
    this.app = new App({
      token: config.slackBotToken,
      appToken: config.slackAppToken,
      socketMode: true
    });
    this.detections = [];
    this.setupListeners();
  }

  setupListeners() {
    // Message event - scan before send
    this.app.message(async ({ message, say, client, context }) => {
      if (message.bot_id || !message.text) return;

      const result = await scan(message.text);
      
      if (result.risk >= 70) {
        // High risk - block message
        try {
          await client.chat.delete({
            channel: message.channel,
            ts: message.ts
          });

          await client.conversations.open({ users: message.user });
          await client.chat.postMessage({
            channel: message.user,
            blocks: this.createBlockMessage(result, 'blocked')
          });

          this.detections.push({
            type: 'block',
            user: message.user,
            channel: message.channel,
            risk: result.risk,
            timestamp: Date.now()
          });
        } catch (error) {
          console.error('Failed to block message:', error);
        }
      } else if (result.risk >= 40) {
        // Medium risk - warn user
        try {
          await client.conversations.open({ users: message.user });
          await client.chat.postMessage({
            channel: message.user,
            blocks: this.createBlockMessage(result, 'warned')
          });
        } catch (error) {
          console.error('Failed to warn user:', error);
        }
      }
    });

    // Slash command: /kasbah
    this.app.command('/kasbah', async ({ command, ack, respond }) => {
      await ack();
      const args = command.text.split(' ');
      
      switch (args[0]) {
        case 'help':
          await respond({ text: this.getHelpText() });
          break;
        case 'scan':
          const text = args.slice(1).join(' ');
          const result = await scan(text);
          await respond({ 
            text: `Risk: ${result.risk}/100\nDecision: ${result.decision}\nReason: ${result.reason}` 
          });
          break;
        case 'stats':
          const stats = this.getStats();
          await respond({ text: stats });
          break;
        default:
          await respond({ text: 'Unknown command. Use /kasbah help' });
      }
    });
  }

  createBlockMessage(result, action) {
    const color = action === 'blocked' ? 'danger' : 'warning';
    const title = action === 'blocked' ? '🛑 Message Blocked' : '⚠️ Security Warning';

    return [
      {
        type: 'header',
        text: { type: 'plain_text', text: title, emoji: true }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Risk Level:* ${result.risk}/100\n*Reason:* ${result.reason}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*What to do:*\n• Never share sensitive data in Slack\n• Rotate any exposed credentials immediately\n• Contact security team if unsure'
        }
      }
    ];
  }

  getHelpText() {
    return `*Kasbah Guard Commands*\n\n` +
      `• \`/kasbah help\` - Show this help\n` +
      `• \`/kasbah scan <text>\` - Scan text for secrets\n` +
      `• \`/kasbah stats\` - Show detection statistics\n\n` +
      `*Protection Active:* Real-time message scanning enabled`;
  }

  getStats() {
    const today = this.detections.filter(d => 
      d.timestamp > Date.now() - 86400000
    ).length;
    
    const blocked = this.detections.filter(d => d.type === 'block').length;
    const warned = this.detections.filter(d => d.type === 'warn').length;

    return `*Kasbah Guard Statistics*\n\n` +
      `Today: ${today} detections\n` +
      `Blocked: ${blocked} messages\n` +
      `Warned: ${warned} users\n` +
      `Protection: Active`;
  }

  async start() {
    await this.app.start();
    console.log('Slack Guard started');
  }
}

module.exports = { SlackGuard };
