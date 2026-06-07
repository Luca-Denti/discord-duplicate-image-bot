const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const Database = require('./database');
const ImageHandler = require('./imageHandler');
const logger = require('./logger');
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

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.once(Events.ClientReady, () => {
            logger.info(`Bot avviato come ${this.client.user.tag}`);
        });

        this.client.on(Events.MessageCreate, async (message) => {
            if (message.author.bot) return;
            await this.handleMessage(message);
        });

        this.client.on(Events.GuildCreate, async (guild) => {
            logger.info(`Aggiunto al server: ${guild.name}`);
            await this.importExistingImages(guild);
        });
    }

    async handleMessage(message) {
        try {
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
            logger.error('Errore gestione messaggio:', error);
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
                title: '⚠️ Immagine duplicata rilevata',
                description: `Questa immagine è già stata inviata in <#${original.channel_id}> da <@${original.author_id}>.`,
                fields: [
                    {
                        name: 'Messaggio originale',
                        value: `https://discord.com/channels/${message.guild.id}/${original.channel_id}/${original.message_id}`
                    },
                    {
                        name: 'Similarità',
                        value: `${original.similarity}%`
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await message.author.send({ embeds: [dmEmbed] });
            await message.react('♻️');

            await this.db.logDuplicate({
                originalId: original.id,
                duplicateMessageId: message.id,
                duplicateAuthorId: message.author.id,
                duplicateChannelId: message.channel.id,
                similarityScore: original.similarity
            });
        } catch (error) {
            logger.error('Errore gestione duplicato:', error);
        }
    }

    async importExistingImages(guild) {
        logger.info(`Inizio importazione per ${guild.name}`);
        const channels = guild.channels.cache.filter(ch => ch.isTextBased() && !ch.isVoiceBased());
        
        for (const [, channel] of channels) {
            await this.importChannelMessages(channel);
        }
    }

    async importChannelMessages(channel, lastMessageId = null) {
        try {
            const options = { limit: 100 };
            if (lastMessageId) options.before = lastMessageId;

            const messages = await channel.messages.fetch(options);
            if (messages.size === 0) return;

            for (const [, message] of messages) {
                if (message.author.bot) continue;
                const images = await this.extractImages(message);
                
                for (const image of images) {
                    const hash = await this.imageHandler.generateHash(image.url);
                    if (hash) {
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
            }

            const oldest = messages.last();
            if (oldest) await this.importChannelMessages(channel, oldest.id);
        } catch (error) {
            logger.error(`Errore importazione ${channel.name}:`, error);
        }
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