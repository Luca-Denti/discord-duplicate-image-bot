const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { hammingDistance } = require('./hashUtils');

class DatabaseManager {
    constructor(dbPath = process.env.DATABASE_PATH || './data/images.db') {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        this.db = new Database(dbPath);
        this.db.function('hamming_distance', { deterministic: true }, hammingDistance);
        this.init();
    }

    init() {
        // Images table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hash TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                author_id TEXT NOT NULL,
                url TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Index for fast hash lookup
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_images_hash ON images(hash)
        `);

        // Guild index
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_images_guild ON images(guild_id)
        `);

        // Index to avoid slow scans during incremental re-imports
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_images_message_url
            ON images(guild_id, message_id, url)
        `);

        // Import progress table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS import_progress (
                guild_id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                last_message_id TEXT,
                status TEXT DEFAULT 'pending',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Duplicates table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS duplicates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_id INTEGER REFERENCES images(id),
                duplicate_message_id TEXT NOT NULL,
                duplicate_author_id TEXT NOT NULL,
                duplicate_channel_id TEXT NOT NULL,
                similarity_score INTEGER,
                detected_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    saveImage(data) {
        if (this.imageExists(data.guildId, data.messageId, data.url)) {
            return { changes: 0, lastInsertRowid: null };
        }

        const stmt = this.db.prepare(`
            INSERT INTO images (hash, guild_id, channel_id, message_id, author_id, url)
            VALUES (@hash, @guildId, @channelId, @messageId, @authorId, @url)
        `);
        
        return stmt.run(data);
    }

    imageExists(guildId, messageId, url) {
        const stmt = this.db.prepare(`
            SELECT 1
            FROM images
            WHERE guild_id = ?
                AND message_id = ?
                AND COALESCE(url, '') = COALESCE(?, '')
            LIMIT 1
        `);

        return Boolean(stmt.get(guildId, messageId, url));
    }

    findSimilarHash(hash, guildId, threshold = 8, options = {}) {
        const filters = ['guild_id = @guildId'];
        const params = {
            hash,
            guildId,
            threshold
        };

        if (options.excludeMessageId) {
            filters.push('message_id != @excludeMessageId');
            params.excludeMessageId = options.excludeMessageId;
        }

        const stmt = this.db.prepare(`
            SELECT *
            FROM (
                SELECT images.*, hamming_distance(hash, @hash) AS distance
                FROM images
                WHERE ${filters.join(' AND ')}
            )
            WHERE distance <= @threshold
            ORDER BY distance ASC, created_at DESC
            LIMIT 1
        `);

        return stmt.get(params);
    }

    logDuplicate(data) {
        const stmt = this.db.prepare(`
            INSERT INTO duplicates 
            (original_id, duplicate_message_id, duplicate_author_id, duplicate_channel_id, similarity_score)
            VALUES (@originalId, @duplicateMessageId, @duplicateAuthorId, @duplicateChannelId, @similarityScore)
        `);
        
        return stmt.run(data);
    }

    deleteImage(imageId) {
        const deleteDuplicateLogs = this.db.prepare(`
            DELETE FROM duplicates
            WHERE original_id = ?
        `);
        const deleteImageRecord = this.db.prepare(`
            DELETE FROM images
            WHERE id = ?
        `);

        return this.db.transaction((id) => {
            deleteDuplicateLogs.run(id);
            return deleteImageRecord.run(id);
        })(imageId);
    }

    getStats(guildId) {
        const totalImages = this.db.prepare('SELECT COUNT(*) as count FROM images WHERE guild_id = ?').get(guildId);
        const totalDuplicates = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM duplicates d
            JOIN images i ON d.original_id = i.id
            WHERE i.guild_id = ?
        `).get(guildId);
        
        return {
            totalImages: totalImages.count,
            totalDuplicates: totalDuplicates.count
        };
    }

    getRecentDuplicates(guildId, limit = 10) {
        return this.db.prepare(`
            SELECT d.*, i.hash, i.url as original_url
            FROM duplicates d
            JOIN images i ON d.original_id = i.id
            WHERE i.guild_id = ?
            ORDER BY d.detected_at DESC
            LIMIT ?
        `).all(guildId, limit);
    }

    updateImportProgress(guildId, channelId, lastMessageId, status) {
        const stmt = this.db.prepare(`
            INSERT INTO import_progress (guild_id, channel_id, last_message_id, status)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET
                channel_id = excluded.channel_id,
                last_message_id = excluded.last_message_id,
                status = excluded.status,
                updated_at = CURRENT_TIMESTAMP
        `);
        
        return stmt.run(guildId, channelId, lastMessageId, status);
    }

    getImportProgress(guildId) {
        return this.db.prepare('SELECT * FROM import_progress WHERE guild_id = ?').get(guildId);
    }

    close() {
        this.db.close();
    }
}

module.exports = DatabaseManager;
