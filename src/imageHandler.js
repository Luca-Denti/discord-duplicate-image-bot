const sharp = require('sharp');
const imageHash = require('image-hash');
const logger = require('./logger');

class ImageHandler {
    constructor(db) {
        this.db = db;
    }

    async generateHash(imageUrl) {
        try {
            // Download the image and generate the hash.
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const buffer = await response.arrayBuffer();
            const imageBuffer = Buffer.from(buffer);

            // Use sharp for preprocessing.
            const processedImage = await sharp(imageBuffer)
                .resize(32, 32, { fit: 'fill' })
                .grayscale()
                .png()
                .toBuffer();

            // Generate pHash using image-hash.
            const hash = await this.computePhash(processedImage);
            
            logger.debug(`Hash generated: ${hash}`);
            return hash;

        } catch (error) {
            logger.error(`Hash generation error for ${imageUrl}:`, error);
            return null;
        }
    }

    async computePhash(imageBuffer) {
        // Simplified pHash implementation.
        // For a complete implementation, use a dedicated library.
        return new Promise((resolve, reject) => {
            try {
                imageHash.imageHash(
                    { data: imageBuffer, name: 'image.png' },
                    16,
                    'hex',
                    (error, hash) => {
                        if (error) reject(error);
                        else resolve(hash);
                    }
                );
            } catch (error) {
                reject(error);
            }
        });
    }

    async findDuplicate(hash, guildId, threshold = null) {
        try {
            // Search for similar hashes in the database.
            const candidates = this.db.findByHashPrefix(hash, guildId);
            
            if (!candidates || candidates.length === 0) {
                return null;
            }

            // Calculate Hamming distance for each candidate.
            for (const candidate of candidates) {
                const distance = this.hammingDistance(hash, candidate.hash);
                const effectiveThreshold = threshold ?? (parseInt(process.env.HASH_THRESHOLD, 10) || 8);

                if (distance <= effectiveThreshold) {
                    return {
                        ...candidate,
                        similarity: Math.round((1 - distance / 64) * 100)
                    };
                }
            }

            return null;

        } catch (error) {
            logger.error('Duplicate search error:', error);
            return null;
        }
    }

    hammingDistance(hash1, hash2) {
        let distance = 0;
        const len = Math.min(hash1.length, hash2.length);

        for (let i = 0; i < len; i++) {
            const bin1 = parseInt(hash1[i], 16).toString(2).padStart(4, '0');
            const bin2 = parseInt(hash2[i], 16).toString(2).padStart(4, '0');

            for (let j = 0; j < 4; j++) {
                if (bin1[j] !== bin2[j]) distance++;
            }
        }

        return distance;
    }

    async saveImage(data) {
        try {
            return this.db.saveImage(data);
        } catch (error) {
            logger.error('Image save error:', error);
            throw error;
        }
    }
}

module.exports = ImageHandler;
