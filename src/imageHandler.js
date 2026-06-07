const sharp = require('sharp');
const imageHash = require('image-hash');
const logger = require('./logger');

class ImageHandler {
    constructor(db) {
        this.db = db;
    }

    async generateHash(imageUrl) {
        try {
            // Scarica l'immagine e genera hash
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const buffer = await response.arrayBuffer();
            const imageBuffer = Buffer.from(buffer);

            // Usa sharp per preprocessing
            const processedImage = await sharp(imageBuffer)
                .resize(32, 32, { fit: 'fill' })
                .grayscale()
                .raw()
                .toBuffer();

            // Genera pHash usando image-hash
            const hash = await this.computePhash(processedImage);
            
            logger.debug(`Hash generato: ${hash}`);
            return hash;

        } catch (error) {
            logger.error(`Errore generazione hash per ${imageUrl}:`, error);
            return null;
        }
    }

    async computePhash(imageBuffer) {
        // Implementazione semplificata di pHash
        // Per una implementazione completa, usa una libreria dedicata
        return new Promise((resolve, reject) => {
            try {
                imageHash.imageHash(
                    { data: imageBuffer, width: 32, height: 32 },
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

    async findDuplicate(hash, guildId) {
        try {
            // Cerca hash simili nel database
            const candidates = this.db.findByHashPrefix(hash, guildId);
            
            if (!candidates || candidates.length === 0) {
                return null;
            }

            // Calcola Hamming distance per ogni candidato
            for (const candidate of candidates) {
                const distance = this.hammingDistance(hash, candidate.hash);
                const threshold = parseInt(process.env.HASH_THRESHOLD) || 8;

                if (distance <= threshold) {
                    return {
                        ...candidate,
                        similarity: Math.round((1 - distance / 64) * 100)
                    };
                }
            }

            return null;

        } catch (error) {
            logger.error('Errore ricerca duplicato:', error);
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
            logger.error('Errore salvataggio immagine:', error);
            throw error;
        }
    }
}

module.exports = ImageHandler;