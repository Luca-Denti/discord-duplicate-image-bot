const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const Database = require('./database');
const ImageHandler = require('./imageHandler');
const logger = require('./logger');
const { commands } = require('./commands');
require('dotenv').config();

class DuplicateBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages
            ],
            partials: [Partials.Channel, Partials.Message]
        });

        this.db = new Database();
        this.imageHandler = new ImageHandler(this.db);
        this.importLocks = new Set();

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.once(Events.ClientReady, async () => {
            logger.info(`Bot started as ${this.client.user.tag}`);
            await this.registerCommands();
        });

        this.client.on(Events.MessageCreate, async (message) => {
            if (message.author.bot) return;
            await this.handleMessage(message);
        });

        this.client.on(Events.InteractionCreate, async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
            await this.handleCommand(interaction);
        });

        this.client.on(Events.GuildCreate, async (guild) => {
            logger.info(`Added to server: ${guild.name}`);
            await this.registerGuildCommands(guild);
            await this.importExistingImages(guild);
        });
    }

    async registerCommands() {
        for (const [, guild] of this.client.guilds.cache) {
            await this.registerGuildCommands(guild);
        }
    }

    async registerGuildCommands(guild) {
        try {
            await guild.commands.set(commands.map(command => command.toJSON()));
            logger.info(`Commands synchronized for ${guild.name}`);
        } catch (error) {
            logger.error(`Command synchronization error for ${guild.name}:`, error);
        }
    }

    async handleCommand(interaction) {
        if (!interaction.guild) {
            await interaction.reply({
                content: 'This command can only be used in a server.',
                ephemeral: true
            });
            return;
        }

        switch (interaction.commandName) {
            case 'dupstats':
                await this.handleStatsCommand(interaction);
                break;
            case 'dupimport':
                await this.handleImportCommand(interaction);
                break;
            case 'duplogs':
                await this.handleLogsCommand(interaction);
                break;
            default:
                break;
        }
    }

    async handleStatsCommand(interaction) {
        const stats = this.db.getStats(interaction.guild.id);

        await interaction.reply({
            content: [
                `Saved images: ${stats.totalImages}`,
                `Detected duplicates: ${stats.totalDuplicates}`
            ].join('\n'),
            ephemeral: true
        });
    }

    async handleImportCommand(interaction) {
        const guildId = interaction.guild.id;
        if (this.importLocks.has(guildId)) {
            await interaction.reply({
                content: 'An import is already running for this server.',
                ephemeral: true
            });
            return;
        }

        this.importLocks.add(guildId);
        await interaction.deferReply({ ephemeral: true });

        try {
            const stats = await this.importExistingImages(interaction.guild);
            await interaction.editReply(
                `Import complete. Images found: ${stats.imagesFound}, added: ${stats.added}, already present: ${stats.skipped}, errors: ${stats.failed}.`
            );
        } catch (error) {
            logger.error('dupimport command error:', error);
            await interaction.editReply('Import did not complete: check the bot logs.');
        } finally {
            this.importLocks.delete(guildId);
        }
    }

    async handleLogsCommand(interaction) {
        const limit = interaction.options.getInteger('limit') || 10;
        const duplicates = this.db.getRecentDuplicates(interaction.guild.id, limit);

        if (!duplicates.length) {
            await interaction.reply({
                content: 'No duplicates have been logged for this server.',
                ephemeral: true
            });
            return;
        }

        const lines = duplicates.map(row => {
            const link = `https://discord.com/channels/${interaction.guild.id}/${row.duplicate_channel_id}/${row.duplicate_message_id}`;
            return `${row.detected_at} - <@${row.duplicate_author_id}> - ${row.similarity_score}% - ${link}`;
        });

        await interaction.reply({
            content: lines.join('\n').slice(0, 1900),
            ephemeral: true
        });
    }

    async handleMessage(message) {
        try {
            if (!message.guild) return;

            if (!message.attachments.size && !this.hasImageUrls(message.content)) return;

            const images = await this.extractImages(message);

            for (const image of images) {
                const hash = await this.imageHandler.generateHash(image.url);
                if (!hash) continue;

                const duplicate = await this.imageHandler.findDuplicate(hash, message.guild.id);

                if (duplicate) {
                    await this.handleDuplicate(message, duplicate, image);
                } else {
                    await this.imageHandler.saveImage({
                        hash,
                        guildId: message.guild.id,
                        channelId: message.channel.id,
                        messageId: message.id,
                        authorId: message.author.id,
                        url: image.url
                    });
                }
            }
        } catch (error) {
            logger.error('Message handling error:', error);
        }
    }

    hasImageUrls(content) {
        const imageRegex = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)/gi;
        return imageRegex.test(content);
    }

    async extractImages(message) {
        const images = [];

        message.attachments.forEach(attachment => {
            if (attachment.contentType?.startsWith('image/')) {
                images.push({ url: attachment.url, type: 'attachment' });
            }
        });

        const urlRegex = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)/gi;
        const urls = message.content.match(urlRegex) || [];
        urls.forEach(url => images.push({ url, type: 'url' }));

        return images;
    }

    async handleDuplicate(message, original, image) {
        try {
            const dmEmbed = {
                color: 0xff6600,
                title: 'Duplicate image detected',
                description: `This image has already been posted in <#${original.channel_id}> by <@${original.author_id}>.`,
                fields: [
                    {
                        name: 'Original message',
                        value: `https://discord.com/channels/${message.guild.id}/${original.channel_id}/${original.message_id}`
                    },
                    {
                        name: 'Similarity',
                        value: `${original.similarity}%`
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await message.author.send({ embeds: [dmEmbed] });
            await message.react('\u267b\ufe0f');

            await this.db.logDuplicate({
                originalId: original.id,
                duplicateMessageId: message.id,
                duplicateAuthorId: message.author.id,
                duplicateChannelId: message.channel.id,
                similarityScore: original.similarity
            });
        } catch (error) {
            logger.error('Duplicate handling error:', error);
        }
    }

    async importExistingImages(guild) {
        logger.info(`Starting import for ${guild.name}`);
        const channels = guild.channels.cache.filter(ch =>
            ch.isTextBased() && !ch.isVoiceBased() && ch.messages?.fetch
        );
        const totals = {
            messagesScanned: 0,
            imagesFound: 0,
            added: 0,
            skipped: 0,
            failed: 0
        };

        for (const [, channel] of channels) {
            const stats = await this.importChannelMessages(channel);
            totals.messagesScanned += stats.messagesScanned;
            totals.imagesFound += stats.imagesFound;
            totals.added += stats.added;
            totals.skipped += stats.skipped;
            totals.failed += stats.failed;
        }

        logger.info(
            `Import completed for ${guild.name}: ${totals.added} added, ${totals.skipped} already present, ${totals.failed} errors`
        );
        return totals;
    }

    async importChannelMessages(channel, lastMessageId = null) {
        const stats = {
            messagesScanned: 0,
            imagesFound: 0,
            added: 0,
            skipped: 0,
            failed: 0
        };

        try {
            const options = { limit: 100 };
            if (lastMessageId) options.before = lastMessageId;

            const messages = await channel.messages.fetch(options);
            if (messages.size === 0) return stats;

            for (const [, message] of messages) {
                stats.messagesScanned++;
                if (message.author.bot) continue;
                if (!message.attachments.size && !this.hasImageUrls(message.content)) continue;

                const images = await this.extractImages(message);
                stats.imagesFound += images.length;

                for (const image of images) {
                    try {
                        if (this.db.imageExists(message.guild.id, message.id, image.url)) {
                            stats.skipped++;
                            continue;
                        }

                        const hash = await this.imageHandler.generateHash(image.url);
                        if (!hash) {
                            stats.failed++;
                            continue;
                        }

                        const result = await this.imageHandler.saveImage({
                            hash,
                            guildId: message.guild.id,
                            channelId: message.channel.id,
                            messageId: message.id,
                            authorId: message.author.id,
                            url: image.url
                        });

                        if (result.changes > 0) {
                            stats.added++;
                        } else {
                            stats.skipped++;
                        }
                    } catch (error) {
                        stats.failed++;
                        logger.error(`Image import error for ${image.url}:`, error);
                    }
                }
            }

            const oldest = messages.last();
            if (oldest) {
                const nextStats = await this.importChannelMessages(channel, oldest.id);
                stats.messagesScanned += nextStats.messagesScanned;
                stats.imagesFound += nextStats.imagesFound;
                stats.added += nextStats.added;
                stats.skipped += nextStats.skipped;
                stats.failed += nextStats.failed;
            }
        } catch (error) {
            stats.failed++;
            logger.error(`Import error for ${channel.name}:`, error);
        }

        return stats;
    }

    async start() {
        await this.client.login(process.env.DISCORD_TOKEN);
    }

    async stop() {
        await this.client.destroy();
        this.db.close();
    }
}

const bot = new DuplicateBot();
bot.start();

process.on('SIGINT', () => bot.stop());
process.on('SIGTERM', () => bot.stop());

module.exports = DuplicateBot;
