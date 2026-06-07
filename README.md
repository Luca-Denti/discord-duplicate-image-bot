# Discord Duplicate Image Bot

Bot Discord per il rilevamento di immagini duplicate tramite perceptual hashing (pHash).

## Funzionalità

- 🔍 Rilevamento immagini duplicate in tempo reale
- 📥 Importazione storica immagini esistenti
- 📬 Notifica DM agli utenti con link al messaggio originale
- 📊 Statistiche e logging
- 🐳 Deploy via Docker

## Requisiti

- Node.js 18+
- Docker (opzionale)
- Token bot Discord

## Installazione

### Locale

```bash
npm install
npm start
```

### Docker

```bash
docker-compose up -d
```

## Configurazione

Copia `.env.example` in `.env` e configura:

```env
DISCORD_TOKEN=il_tuo_token
DATABASE_PATH=./data/images.db
HASH_THRESHOLD=8
LOG_LEVEL=info
```

## Comandi

| Comando | Descrizione | Permessi |
|---------|-------------|----------|
| `/dupconfig` | Configura soglia e azioni | Admin |
| `/dupstats` | Statistiche duplicati | Admin |
| `/dupimport` | Re-importazione immagini | Admin |
| `/duplogs` | Ultimi duplicati rilevati | Admin |

## Architettura

- **pHash**: Perceptual hashing con Hamming distance ≤ 8
- **SQLite**: Storage hash e metadata
- **Sharp**: Image processing
- **Discord.js v14**: Interazione Discord

## Licenza

MIT
