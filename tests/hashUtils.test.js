const { hammingDistance } = require('../src/hashUtils');

describe('hammingDistance', () => {
    test('counts differing bits across the entire hash', () => {
        expect(hammingDistance('f00fe147', 'f007e147')).toBe(1);
        expect(hammingDistance('00', 'ff')).toBe(8);
    });

    test('rejects malformed or differently sized hashes', () => {
        expect(hammingDistance('0', '00')).toBe(Number.MAX_SAFE_INTEGER);
        expect(hammingDistance('zz', '00')).toBe(Number.MAX_SAFE_INTEGER);
    });
});
