/**
 * Kasbah Guard — Discord Guardian
 * 
 * Real-time message scanning for Discord servers
 * Auto-moderation for secrets, PII, and phishing
 */

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { scan } = require('@kasbah/detector');

class DiscordGuardian {
  constructor(config) {
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });
    this.detections = [];
    this.setupListeners();
  }

  setupListeners() {
    this.client.on('ready', () => {
      console.log(`Discord Guardian logged in as ${this.client.user.tag}`);
      this.client.user.setPresence({
        activities: [{ name: 'for secrets 🔒' }],
        status: 'online'
      });
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      const result = await scan(message.content);

      if (result.risk >= 70) {
        // High risk - delete and timeout
        try {
          await message.delete();
          await message.member.timeout(60000, 'Security violation');
          
          await message.author.send({
            embeds: [{
              title: '🛑 Message Blocked',
              description: `**Risk:** ${result.risk}/100\n**Reason:** ${result.reason}`,
              color: 0xff0000,
              fields: [
                {
                  name: 'What to do',
                  value: '• Never share sensitive data in Discord\n• Rotate exposed credentials\n• Contact server admins if unsure'
                }
              ]
            }]
          });

          this.detections.push({
            type: 'block',
            user: message.author.id,
            channel: message.channel.id,
            risk: result.risk,
            timestamp: Date.now()
          });
        } catch (error) {
          console.error('Failed to block message:', error);
        }
      } else if (result.risk >= 40) {
        // Medium risk - warn
        try {
          await message.author.send({
            embeds: [{
              title: '⚠️ Security Warning',
              description: `**Risk:** ${result.risk}/100\n**Reason:** ${result.reason}`,
              color: 0xffa500
            }]
          });
        } catch (error) {
          // User has DMs disabled
        }
      }
    });

    // Slash command: !kasbah
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === 'kasbah') {
        const subcommand = interaction.options.getString('action');
        
        switch (subcommand) {
          case 'scan':
            const text = interaction.options.getString('text');
            const result = await scan(text);
            await interaction.reply({
              content: `**Risk:** ${result.risk}/100\n**Decision:** ${result.decision}\n**Reason:** ${result.reason}`,
              ephemeral: true
            });
            break;
          case 'stats':
            const stats = this.getStats();
            await interaction.reply({ content: stats, ephemeral: true });
            break;
          case 'help':
            await interaction.reply({
              content: '*Kasbah Guard Commands*\n\n• `/kasbah scan <text>` - Scan text\n• `/kasbah stats` - Show statistics\n• `/kasbah help` - Show this help',
              ephemeral: true
            });
            break;
        }
      }
    });
  }

  getStats() {
    const today = this.detections.filter(d => 
      d.timestamp > Date.now() - 86400000
    ).length;
    
    const blocked = this.detections.filter(d => d.type === 'block').length;

    return `*Kasbah Guard Statistics*\n\n` +
      `Today: ${today} detections\n` +
      `Blocked: ${blocked} messages\n` +
      `Protection: Active`;
  }

  async start() {
    await this.client.login(this.config.discordBotToken);
  }
}

module.exports = { DiscordGuardian };
