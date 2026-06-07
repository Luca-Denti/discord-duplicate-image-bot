const Database = require('better-sqlite3');
const path = require('path');
const logger = require('./logger');

class DatabaseManager {
    constructor() {
        const dbPath = process.env.DATABASE_PATH || './data/images.db';
        this.db = new Database(dbPath);
        this.init();
    }

    init() {
        // Tabella immagini
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

        // Indice per ricerca rapida hash
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_images_hash ON images(hash)
        `);

        // Indice per guild
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_images_guild ON images(guild_id)
        `);

        // Tabella progresso importazione
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS import_progress (
                guild_id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                last_message_id TEXT,
                status TEXT DEFAULT 'pending',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabella duplicati
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

        logger.info('Database inizializzato con successo');
    }

    saveImage(data) {
        const stmt = this.db.prepare(`
            INSERT INTO images (hash, guild_id, channel_id, message_id, author_id, url)
            VALUES (@hash, @guildId, @channelId, @messageId, @authorId, @url)
        `);
        
        return stmt.run(data);
    }

    findSimilarHash(hash, guildId, threshold = 8) {
        // Per Hamming distance, usiamo una query che confronta i bit
        // Nota: SQLite non ha funzioni bitwise native, quindi usiamo un approccio semplificato
        const stmt = this.db.prepare(`
            SELECT *, hamming_distance(hash, ?) as distance
            FROM images
            WHERE guild_id = ?
            HAVING distance <= ?
            ORDER BY distance
            LIMIT 1
        `);
        
        return stmt.get(hash, guildId, threshold);
    }

    // Metodo alternativo senza funzione custom
    findByHashPrefix(hash, guildId) {
        // Usa i primi 8 caratteri come pre-filtro veloce
        const prefix = hash.substring(0, 8);
        const stmt = this.db.prepare(`
            SELECT * FROM images
            WHERE guild_id = ? AND hash LIKE ?
            ORDER BY created_at DESC
            LIMIT 10
        `);
        
        return stmt.all(guildId, `${prefix}%`);
    }

    logDuplicate(data) {
        const stmt = this.db.prepare(`
            INSERT INTO duplicates 
            (original_id, duplicate_message_id, duplicate_author_id, duplicate_channel_id, similarity_score)
            VALUES (@originalId, @duplicateMessageId, @duplicateAuthorId, @duplicateChannelId, @similarityScore)
        `);
        
        return stmt.run(data);
    }

    getStats(guildId) {
        const totalImages = this.db.prepare('SELECT COUNT(*) as count FROM images WHERE guild_id = ?').get(guildId);
        const totalDuplicates = this.db.prepare('SELECT COUNT(*) as count FROM duplicates WHERE duplicate_message_id IN (SELECT message_id FROM images WHERE guild_id = ?)').get(guildId);
        
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