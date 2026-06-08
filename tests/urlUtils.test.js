const { imageUrlsMatch } = require('../src/urlUtils');

describe('imageUrlsMatch', () => {
    test('matches Discord attachment URLs across hosts and rotated signatures', () => {
        const stored = 'https://cdn.discordapp.com/attachments/1/2/image.png?ex=old&is=old&hm=old';
        const current = 'https://media.discordapp.net/attachments/1/2/image.png?ex=new&is=new&hm=new';

        expect(imageUrlsMatch(stored, current)).toBe(true);
    });

    test('does not ignore query parameters on external URLs', () => {
        expect(imageUrlsMatch(
            'https://example.com/image?id=1',
            'https://example.com/image?id=2'
        )).toBe(false);
    });
});
