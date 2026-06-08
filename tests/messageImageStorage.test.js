const fs = require('fs');
const os = require('os');
const path = require('path');
const DuplicateBot = require('../src/index');
const Database = require('../src/database');
const ImageHandler = require('../src/imageHandler');

function createImageMessage(overrides = {}) {
    return {
        id: 'message-with-many-images',
        content: '',
        attachments: new Map([
            ['attachment-1', {
                contentType: 'image/png',
                url: 'https://cdn.discordapp.com/attachments/channel-1/attachment-1/one.png',
                proxyURL: null
            }],
            ['attachment-2', {
                contentType: 'image/jpeg',
                url: 'https://cdn.discordapp.com/attachments/channel-1/attachment-2/two.jpg',
                proxyURL: null
            }],
            ['attachment-3', {
                contentType: 'image/webp',
                url: 'https://cdn.discordapp.com/attachments/channel-1/attachment-3/three.webp',
                proxyURL: null
            }]
        ]),
        embeds: [],
        guild: { id: 'guild-1' },
        channel: { id: 'channel-1' },
        author: { id: 'author-1', bot: false },
        ...overrides
    };
}

describe('message image storage', () => {
    let tempDirectory;
    let database;
    let bot;
    let consoleLogSpy;

    beforeEach(() => {
        tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicate-bot-'));
        database = new Database(path.join(tempDirectory, 'images.db'));
        bot = Object.create(DuplicateBot.prototype);
        bot.db = database;
        bot.imageHandler = new ImageHandler(database);
        bot.logDirectory = path.join(tempDirectory, 'logs');
        bot.logDebugMessageAnalysis = jest.fn();
        bot.generateHashFromImage = jest.fn().mockResolvedValue('f007e147');
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        database.close();
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    });

    test('stores every image from a live multi-image message with the correct message id', async () => {
        const message = createImageMessage();

        await bot.handleMessage(message);

        const rows = database.db.prepare(`
            SELECT message_id, channel_id, guild_id, author_id, url
            FROM images
            ORDER BY url
        `).all();

        expect(rows).toHaveLength(3);
        expect(rows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                message_id: 'message-with-many-images',
                channel_id: 'channel-1',
                guild_id: 'guild-1',
                author_id: 'author-1',
                url: 'https://cdn.discordapp.com/attachments/channel-1/attachment-1/one.png'
            }),
            expect.objectContaining({
                message_id: 'message-with-many-images',
                url: 'https://cdn.discordapp.com/attachments/channel-1/attachment-2/two.jpg'
            }),
            expect.objectContaining({
                message_id: 'message-with-many-images',
                url: 'https://cdn.discordapp.com/attachments/channel-1/attachment-3/three.webp'
            })
        ]));
    });

    test('imports every image from a historical multi-image message with the correct message id', async () => {
        const message = createImageMessage();
        const messages = new Map([['message-with-many-images', message]]);
        messages.last = jest.fn()
            .mockReturnValueOnce(message)
            .mockReturnValueOnce(null);

        const channel = {
            id: 'channel-1',
            name: 'images',
            messages: {
                fetch: jest.fn()
                    .mockResolvedValueOnce(messages)
                    .mockResolvedValueOnce(new Map())
            }
        };
        message.channel = channel;

        const stats = await bot.importChannelMessages(channel);
        const rows = database.db.prepare(`
            SELECT message_id, channel_id, guild_id, author_id, url
            FROM images
            ORDER BY url
        `).all();

        expect(stats).toMatchObject({
            messagesScanned: 1,
            imagesFound: 3,
            added: 3,
            skipped: 0,
            failed: 0
        });
        expect(rows).toHaveLength(3);
        expect(rows.every(row => row.message_id === 'message-with-many-images')).toBe(true);
        expect(rows.every(row => row.channel_id === 'channel-1')).toBe(true);
    });

    test('logs only server import start and completion in a guild-specific file', async () => {
        const guild = {
            id: 'guild-1',
            name: 'Test Guild',
            channels: {
                cache: new Map()
            }
        };
        guild.channels.cache.filter = jest.fn().mockReturnValue(new Map());

        const stats = await bot.importExistingImages(guild);
        const logPath = path.join(bot.logDirectory, 'import-guild-1.log');

        expect(stats).toMatchObject({
            messagesScanned: 0,
            imagesFound: 0,
            added: 0,
            skipped: 0,
            failed: 0
        });
        expect(fs.existsSync(logPath)).toBe(true);

        const entries = fs.readFileSync(logPath, 'utf8')
            .trim()
            .split('\n')
            .map(line => JSON.parse(line));
        expect(entries).toEqual([
            expect.objectContaining({
                event: 'server_import_start',
                guildId: 'guild-1',
                guildName: 'Test Guild',
                trigger: 'direct',
                channelCount: 0
            }),
            expect.objectContaining({
                event: 'server_import_complete',
                guildId: 'guild-1',
                guildName: 'Test Guild',
                trigger: 'direct',
                channelCount: 0,
                stats: expect.objectContaining({
                    messagesScanned: 0,
                    imagesFound: 0,
                    added: 0,
                    skipped: 0,
                    failed: 0
                })
            })
        ]);

        const consoleEntries = consoleLogSpy.mock.calls.map(([line]) => JSON.parse(line));
        expect(consoleEntries).toEqual(entries);
    });

    test('does not log individual fetched messages during import', async () => {
        const message = createImageMessage();
        const messages = new Map([['message-with-many-images', message]]);
        messages.last = jest.fn()
            .mockReturnValueOnce(message)
            .mockReturnValueOnce(null);

        const channel = {
            id: 'channel-1',
            name: 'images',
            guildId: 'guild-1',
            messages: {
                fetch: jest.fn()
                    .mockResolvedValueOnce(messages)
                    .mockResolvedValueOnce(new Map())
            }
        };
        message.channel = channel;

        await bot.importChannelMessages(channel);

        expect(fs.existsSync(path.join(bot.logDirectory, 'import-guild-1.log'))).toBe(false);
        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    test('imports every cached guild when the bot starts', async () => {
        const firstGuild = {
            id: 'guild-1',
            name: 'First Guild',
            channels: {
                cache: new Map()
            }
        };
        firstGuild.channels.cache.filter = jest.fn().mockReturnValue(new Map());

        const secondGuild = {
            id: 'guild-2',
            name: 'Second Guild',
            channels: {
                cache: new Map()
            }
        };
        secondGuild.channels.cache.filter = jest.fn().mockReturnValue(new Map());

        bot.client = {
            guilds: {
                cache: new Map([
                    ['guild-1', firstGuild],
                    ['guild-2', secondGuild]
                ])
            }
        };

        await bot.importStartupGuilds();

        for (const guildId of ['guild-1', 'guild-2']) {
            const logPath = path.join(bot.logDirectory, `import-${guildId}.log`);
            const entries = fs.readFileSync(logPath, 'utf8')
                .trim()
                .split('\n')
                .map(line => JSON.parse(line));

            expect(entries.map(entry => entry.event)).toEqual([
                'server_import_start',
                'server_import_complete'
            ]);
            expect(entries.every(entry => entry.trigger === 'bot_startup')).toBe(true);
        }
    });
});
