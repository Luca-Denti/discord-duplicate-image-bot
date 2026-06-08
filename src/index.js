const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const Database = require('./database');
const ImageHandler = require('./imageHandler');
const { commands } = require('./commands');
const { imageUrlsMatch } = require('./urlUtils');
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
        this.logDirectory = process.env.LOG_DIR || './logs';

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.once(Events.ClientReady, async () => {
            await this.registerCommands();
            await this.importStartupGuilds();
        });

        this.client.on(Events.MessageCreate, async (message) => {
            if (message.author.bot) return;
            this.logDebugMessage(message, 'messageCreate');
            await this.handleMessage(message);
        });

        this.client.on(Events.InteractionCreate, async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
            await this.handleCommand(interaction);
        });

        this.client.on(Events.GuildCreate, async (guild) => {
            await this.registerGuildCommands(guild);
            await this.importExistingImages(guild, { trigger: 'guildCreate' });
        });
    }

    async registerCommands() {
        for (const [, guild] of this.client.guilds.cache) {
            await this.registerGuildCommands(guild);
        }
    }

    async importStartupGuilds() {
        for (const [, guild] of this.client.guilds.cache) {
            await this.importExistingImages(guild, { trigger: 'bot_startup' });
        }
    }

    async registerGuildCommands(guild) {
        try {
            await guild.commands.set(commands.map(command => command.toJSON()));
        } catch (error) {
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

    logDebugMessage(message, event = 'message') {
    }

    logDebugMessageAnalysis(message, status, details = {}) {
    }

    logServerImportEvent(guild, event, details = {}) {
        const guildId = guild?.id || details.guildId || 'unknown-guild';
        const entry = {
            timestamp: new Date().toISOString(),
            event,
            guildId,
            guildName: guild?.name || null,
            trigger: details.trigger || null,
            channelCount: details.channelCount ?? null,
            stats: details.stats || null,
            error: details.error || null
        };

        const line = this.stringifyLogEntry(entry);
        console.log(line);
        this.writeJsonLine(this.getImportLogPath(guildId), entry);
    }

    getImportLogPath(guildId) {
        const safeGuildId = this.sanitizeLogFilePart(guildId || 'unknown-guild');
        return path.join(this.logDirectory || './logs', `import-${safeGuildId}.log`);
    }

    sanitizeLogFilePart(value) {
        return String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    writeJsonLine(filePath, entry) {
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.appendFileSync(filePath, `${this.stringifyLogEntry(entry)}\n`, 'utf8');
        } catch (error) {
        }
    }

    ensureLogFile(filePath) {
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.closeSync(fs.openSync(filePath, 'a'));
        } catch (error) {
        }
    }

    stringifyLogEntry(entry) {
        const seen = new WeakSet();
        return JSON.stringify(entry, (key, value) => {
            if (typeof value === 'bigint') return value.toString();
            if (value instanceof Error) {
                return {
                    name: value.name,
                    message: value.message,
                    code: value.code,
                    stack: value.stack
                };
            }
            if (value && typeof value === 'object') {
                if (seen.has(value)) return '[Circular]';
                seen.add(value);
            }
            return value;
        });
    }

    serializeMessageForDebug(message) {
        return {
            id: message.id,
            content: message.content,
            author: message.author ? {
                id: message.author.id,
                username: message.author.username,
                globalName: message.author.globalName,
                tag: message.author.tag,
                bot: message.author.bot,
                system: message.author.system
            } : null,
            guild: message.guild ? {
                id: message.guild.id,
                name: message.guild.name,
                ownerId: message.guild.ownerId,
                memberCount: message.guild.memberCount
            } : null,
            channel: message.channel ? {
                id: message.channel.id,
                name: message.channel.name,
                type: message.channel.type,
                parentId: message.channel.parentId,
                guildId: message.channel.guildId
            } : null,
            attachments: this.serializeCollection(message.attachments, attachment => ({
                id: attachment.id,
                name: attachment.name,
                description: attachment.description,
                contentType: attachment.contentType,
                size: attachment.size,
                url: attachment.url,
                proxyURL: attachment.proxyURL,
                height: attachment.height,
                width: attachment.width,
                ephemeral: attachment.ephemeral,
                duration: attachment.duration,
                waveform: attachment.waveform,
                flags: attachment.flags?.bitfield ?? null
            })),
            embeds: (message.embeds || []).map(embed => embed.toJSON?.() ?? embed),
            stickers: this.serializeCollection(message.stickers, sticker => ({
                id: sticker.id,
                name: sticker.name,
                description: sticker.description,
                type: sticker.type,
                format: sticker.format,
                url: sticker.url,
                guildId: sticker.guildId,
                available: sticker.available
            })),
            mentions: {
                everyone: message.mentions?.everyone ?? false,
                users: this.serializeCollection(message.mentions?.users, user => ({
                    id: user.id,
                    username: user.username,
                    globalName: user.globalName,
                    tag: user.tag,
                    bot: user.bot
                })),
                members: this.serializeCollection(message.mentions?.members, member => ({
                    id: member.id,
                    displayName: member.displayName,
                    nickname: member.nickname,
                    userId: member.user?.id
                })),
                roles: this.serializeCollection(message.mentions?.roles, role => ({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                    position: role.position
                })),
                channels: this.serializeCollection(message.mentions?.channels, channel => ({
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    guildId: channel.guildId
                })),
                repliedUser: message.mentions?.repliedUser ? {
                    id: message.mentions.repliedUser.id,
                    username: message.mentions.repliedUser.username,
                    tag: message.mentions.repliedUser.tag,
                    bot: message.mentions.repliedUser.bot
                } : null
            },
            components: (message.components || []).map(component => component.toJSON?.() ?? component),
            createdAt: message.createdAt?.toISOString() ?? null,
            flags: {
                bitfield: message.flags?.bitfield ?? null,
                serialized: message.flags?.serialize?.() ?? null
            },
            reference: message.reference ? {
                type: message.reference.type,
                guildId: message.reference.guildId,
                channelId: message.reference.channelId,
                messageId: message.reference.messageId,
                failIfNotExists: message.reference.failIfNotExists
            } : null,
            interactionMetadata: message.interactionMetadata?.toJSON?.() ?? message.interactionMetadata ?? null,
            url: message.url,
            type: message.type,
            system: message.system,
            pinned: message.pinned,
            tts: message.tts,
            nonce: message.nonce,
            position: message.position,
            webhookId: message.webhookId,
            applicationId: message.applicationId,
            activity: message.activity,
            cleanContent: message.cleanContent,
            editable: message.editable,
            deletable: message.deletable,
            bulkDeletable: message.bulkDeletable,
            crosspostable: message.crosspostable,
            partial: message.partial,
            editedAt: message.editedAt?.toISOString() ?? null,
            raw: message.toJSON?.() ?? null
        };
    }

    serializeCollection(collection, serializeItem) {
        if (!collection) return [];
        if (typeof collection.values === 'function') {
            return Array.from(collection.values(), serializeItem);
        }
        if (Array.isArray(collection)) {
            return collection.map(serializeItem);
        }
        return [];
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
            const stats = await this.importExistingImages(interaction.guild, { trigger: 'dupimport_command' });
            const message = `Import complete. Images found: ${stats.imagesFound}, added: ${stats.added}, already present: ${stats.skipped}, errors: ${stats.failed}.`;
            await interaction.editReply(`${message}\nLog file: ${this.getImportLogPath(interaction.guild.id)}`);
        } catch (error) {
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
            if (!message.guild) {
                this.logDebugMessageAnalysis(message, 'skipped_no_guild');
                return;
            }

            const images = await this.extractImages(message);
            this.logDebugMessageAnalysis(message, 'images_extracted', {
                imagesFound: images.length,
                images
            });

            if (!images.length) {
                this.logDebugMessageAnalysis(message, 'completed_no_images', {
                    duplicateFound: false
                });
                return;
            }

            for (const image of images) {
                const hash = await this.generateHashFromImage(image);
                if (!hash) {
                    this.logDebugMessageAnalysis(message, 'image_hash_failed', {
                        duplicateFound: false,
                        image
                    });
                    continue;
                }

                const duplicate = await this.findValidDuplicateOrReplaceStale(message, hash);

                if (duplicate) {
                    this.logDebugMessageAnalysis(message, 'duplicate_found', {
                        duplicateFound: true,
                        image,
                        hash,
                        duplicate
                    });
                    await this.handleDuplicate(message, duplicate, image);
                } else {
                    const saveResult = await this.imageHandler.saveImage({
                        hash,
                        guildId: message.guild.id,
                        channelId: message.channel.id,
                        messageId: message.id,
                        authorId: message.author.id,
                        url: image.url
                    });

                    this.logDebugMessageAnalysis(message, 'no_duplicate_saved', {
                        duplicateFound: false,
                        image,
                        hash,
                        saved: saveResult.changes > 0,
                        saveResult
                    });
                }
            }
        } catch (error) {
        }
    }

    async findValidDuplicateOrReplaceStale(message, hash) {
        const maxStaleRecordsToClean = 10;

        for (let attempts = 0; attempts < maxStaleRecordsToClean; attempts++) {
            const duplicate = await this.imageHandler.findDuplicate(hash, message.guild.id, null, {
                excludeMessageId: message.id
            });
            if (!duplicate) return null;

            const originalExists = await this.originalImageExists(message.guild, duplicate, hash);
            if (originalExists) return duplicate;

            this.db.deleteImage(duplicate.id);
        }

        return null;
    }

    async originalImageExists(guild, original, comparisonHash = null) {
        try {
            const channel = await guild.channels.fetch(original.channel_id);
            if (!channel?.isTextBased() || !channel.messages?.fetch) return false;

            const originalMessage = await channel.messages.fetch(original.message_id);
            if (!original.url) return Boolean(originalMessage);

            if (this.messageStillContainsImage(originalMessage, original.url)) return true;

            return this.messageStillContainsSimilarImage(originalMessage, original, comparisonHash);
        } catch (error) {
            if (error.code === 10003 || error.code === 10008) return false;

            return true;
        }
    }

    messageStillContainsImage(message, imageUrl) {
        const attachmentStillExists = message.attachments.some(attachment =>
            imageUrlsMatch(attachment.url, imageUrl) ||
            imageUrlsMatch(attachment.proxyURL, imageUrl)
        );

        const embedStillExists = message.embeds.some(embed =>
            this.getEmbedImageCandidates(embed).some(candidate =>
                imageUrlsMatch(candidate, imageUrl)
            )
        );

        const contentStillContainsImage = this.extractImageUrlsFromContent(message.content)
            .some(candidate => imageUrlsMatch(candidate, imageUrl));

        return attachmentStillExists || embedStillExists || contentStillContainsImage;
    }

    async messageStillContainsSimilarImage(message, original, comparisonHash = null) {
        const images = await this.extractImages(message);
        if (!images.length) return false;

        const threshold = parseInt(process.env.HASH_THRESHOLD, 10) || 8;
        const referenceHashes = [original.hash, comparisonHash].filter(Boolean);

        for (const image of images) {
            const hash = await this.generateHashFromImage(image);
            if (!hash) continue;

            if (referenceHashes.some(referenceHash =>
                this.imageHandler.hammingDistance(hash, referenceHash) <= threshold
            )) {
                return true;
            }
        }

        return false;
    }

    hasImageUrls(content) {
        return this.extractImageUrlsFromContent(content).length > 0;
    }

    async extractImages(message) {
        const images = new Map();

        message.attachments.forEach(attachment => {
            if (attachment.contentType?.startsWith('image/')) {
                this.addImageCandidate(images, attachment.url, 'attachment', [
                    attachment.url,
                    attachment.proxyURL
                ]);
            }
        });

        this.extractImageUrlsFromContent(message.content)
            .forEach(url => this.addImageCandidate(images, url, 'url', [url]));

        message.embeds.forEach(embed => {
            const candidates = this.getEmbedImageCandidates(embed);
            if (candidates.length > 0) {
                this.addImageCandidate(images, candidates[0], 'embed', candidates);
            }
        });

        return Array.from(images.values());
    }

    extractImageUrlsFromContent(content = '') {
        const urlRegex = /https?:\/\/[^\s<>()]+/gi;
        const urls = content.match(urlRegex) || [];
        return urls
            .map(url => url.replace(/[.,!?'"`]+$/g, ''))
            .filter(url => this.isImageUrl(url));
    }

    isImageUrl(url) {
        try {
            const parsed = new URL(url);
            return /\.(?:jpe?g|png|gif|webp)$/i.test(parsed.pathname);
        } catch {
            return false;
        }
    }

    getEmbedImageCandidates(embed) {
        const candidates = [
            embed.image?.proxyURL,
            embed.image?.url,
            embed.thumbnail?.proxyURL,
            embed.thumbnail?.url,
            this.isImageUrl(embed.url) ? embed.url : null
        ];

        return [...new Set(candidates.filter(Boolean))];
    }

    addImageCandidate(images, url, type, candidates) {
        const urls = [...new Set(candidates.filter(Boolean))];
        if (!url || urls.length === 0) return;

        const existingKey = [...images.entries()]
            .find(([, image]) => image.url === url || image.urls.some(candidate => urls.includes(candidate)))
            ?.[0];

        if (existingKey) {
            const existing = images.get(existingKey);
            existing.urls = [...new Set([...urls, ...existing.urls])];
            return;
        }

        images.set(url, { url, type, urls });
    }

    async generateHashFromImage(image) {
        const urls = image.urls?.length ? image.urls : [image.url];

        for (const url of urls) {
            const hash = await this.imageHandler.generateHash(url, { silent: true });
            if (hash) return hash;
        }

        return null;
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
        }
    }

    async importExistingImages(guild, options = {}) {
        this.ensureLogFile(this.getImportLogPath(guild.id));

        const channels = guild.channels.cache.filter(ch =>
            ch.isTextBased() && !ch.isVoiceBased() && ch.messages?.fetch
        );
        this.logServerImportEvent(guild, 'server_import_start', {
            trigger: options.trigger || 'direct',
            channelCount: channels.size
        });

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

        this.logServerImportEvent(guild, 'server_import_complete', {
            trigger: options.trigger || 'direct',
            channelCount: channels.size,
            stats: totals
        });

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

                const images = await this.extractImages(message);
                if (!images.length) continue;
                stats.imagesFound += images.length;

                for (const image of images) {
                    try {
                        if (this.db.imageExists(message.guild.id, message.id, image.url)) {
                            stats.skipped++;
                            continue;
                        }

                        const hash = await this.generateHashFromImage(image);
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

if (require.main === module) {
    const bot = new DuplicateBot();
    bot.start();

    process.on('SIGINT', () => bot.stop());
    process.on('SIGTERM', () => bot.stop());
}

module.exports = DuplicateBot;
