const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('../src/database');
const ImageHandler = require('../src/imageHandler');

describe('duplicate search', () => {
    let tempDirectory;
    let database;

    beforeEach(() => {
        tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicate-bot-'));
        database = new Database(path.join(tempDirectory, 'images.db'));
    });

    afterEach(() => {
        database.close();
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    });

    test('finds a close hash even when its prefix differs', async () => {
        database.saveImage({
            hash: 'f007e147',
            guildId: 'guild-1',
            channelId: 'channel-1',
            messageId: 'message-1',
            authorId: 'author-1',
            url: 'https://example.com/image.png'
        });

        const handler = new ImageHandler(database);
        const duplicate = await handler.findDuplicate('f00fe147', 'guild-1', 1);

        expect(duplicate).toMatchObject({
            message_id: 'message-1',
            distance: 1,
            similarity: 96
        });
    });

    test('returns the closest candidate within the threshold', async () => {
        for (const [hash, messageId] of [
            ['f007e147', 'distance-1'],
            ['f03fe147', 'distance-2']
        ]) {
            database.saveImage({
                hash,
                guildId: 'guild-1',
                channelId: 'channel-1',
                messageId,
                authorId: 'author-1',
                url: `https://example.com/${messageId}.png`
            });
        }

        const handler = new ImageHandler(database);
        const duplicate = await handler.findDuplicate('f00fe147', 'guild-1', 2);

        expect(duplicate.message_id).toBe('distance-1');
        expect(duplicate.distance).toBe(1);
    });
});
