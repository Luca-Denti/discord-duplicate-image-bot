const DuplicateBot = require('../src/index');
const { hammingDistance } = require('../src/hashUtils');

describe('original image validation', () => {
    let bot;

    beforeEach(() => {
        bot = Object.create(DuplicateBot.prototype);
        bot.imageHandler = { hammingDistance };
    });

    test('keeps an original record valid when the message image URL changed but the hash still matches', async () => {
        const original = {
            id: 9580,
            hash: '0000380c3e7cffff5e78780c3e7e0a78222c8181e7ff07f8ffff0ff001400670',
            channel_id: 'channel-1',
            message_id: 'message-1',
            url: 'https://cdn.discordapp.com/attachments/channel-1/old-attachment/original.png?ex=old'
        };

        const originalMessage = {
            content: '',
            attachments: [
                {
                    contentType: 'image/png',
                    url: 'https://cdn.discordapp.com/attachments/channel-1/new-attachment/original.png?ex=new',
                    proxyURL: 'https://media.discordapp.net/attachments/channel-1/new-attachment/original.png?ex=new'
                }
            ],
            embeds: []
        };

        const guild = {
            channels: {
                fetch: jest.fn().mockResolvedValue({
                    isTextBased: () => true,
                    messages: {
                        fetch: jest.fn().mockResolvedValue(originalMessage)
                    }
                })
            }
        };

        bot.generateHashFromImage = jest.fn().mockResolvedValue(original.hash);

        await expect(bot.originalImageExists(guild, original, original.hash)).resolves.toBe(true);
        expect(bot.generateHashFromImage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'attachment'
        }));
    });

    test('treats the original record as stale when the message no longer contains a matching image', async () => {
        const original = {
            id: 9580,
            hash: '0000380c3e7cffff5e78780c3e7e0a78222c8181e7ff07f8ffff0ff001400670',
            channel_id: 'channel-1',
            message_id: 'message-1',
            url: 'https://cdn.discordapp.com/attachments/channel-1/old-attachment/original.png?ex=old'
        };

        const originalMessage = {
            content: '',
            attachments: [
                {
                    contentType: 'image/png',
                    url: 'https://cdn.discordapp.com/attachments/channel-1/new-attachment/different.png?ex=new',
                    proxyURL: null
                }
            ],
            embeds: []
        };

        const guild = {
            channels: {
                fetch: jest.fn().mockResolvedValue({
                    isTextBased: () => true,
                    messages: {
                        fetch: jest.fn().mockResolvedValue(originalMessage)
                    }
                })
            }
        };

        bot.generateHashFromImage = jest.fn().mockResolvedValue('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

        await expect(bot.originalImageExists(guild, original, original.hash)).resolves.toBe(false);
    });
});
