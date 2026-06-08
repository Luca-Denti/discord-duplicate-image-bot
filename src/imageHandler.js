const sharp = require('sharp');
const imageHash = require('image-hash');
const logger = require('./logger');
const { hammingDistance } = require('./hashUtils');

class ImageHandler {
    constructor(db) {
        this.db = db;
    }

    async generateHash(imageUrl, options = {}) {
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
            if (!options.silent) {
                logger.error(`Hash generation error for ${imageUrl}:`, error);
            }
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
            const effectiveThreshold = threshold ?? (parseInt(process.env.HASH_THRESHOLD, 10) || 8);
            const candidate = this.db.findSimilarHash(hash, guildId, effectiveThreshold);

            if (!candidate) return null;

            const bitLength = hash.length * 4;
            return {
                ...candidate,
                similarity: Math.floor((1 - candidate.distance / bitLength) * 100)
            };

        } catch (error) {
            logger.error('Duplicate search error:', error);
            return null;
        }
    }

    hammingDistance(hash1, hash2) {
        return hammingDistance(hash1, hash2);
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
