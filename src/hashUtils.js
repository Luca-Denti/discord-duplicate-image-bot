function hammingDistance(hash1, hash2) {
    if (
        typeof hash1 !== 'string' ||
        typeof hash2 !== 'string' ||
        hash1.length !== hash2.length ||
        !/^[0-9a-f]+$/i.test(hash1) ||
        !/^[0-9a-f]+$/i.test(hash2)
    ) {
        return Number.MAX_SAFE_INTEGER;
    }

    let distance = 0;

    for (let i = 0; i < hash1.length; i++) {
        let difference = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);

        while (difference) {
            distance += difference & 1;
            difference >>= 1;
        }
    }

    return distance;
}

module.exports = { hammingDistance };
