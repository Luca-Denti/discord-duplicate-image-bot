# Discord Duplicate Image Bot

Discord bot for duplicate image detection using perceptual hashing (pHash).

## Features

- Real-time duplicate image detection
- Historical import of existing images
- DM notifications with a link to the original message
- Statistics and logging
- Docker deployment

## Requirements

- Node.js 18+
- Docker (optional)
- Discord bot token

## Installation

### Local

```bash
npm install
npm start
```

### Docker

```bash
docker-compose up -d
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
DISCORD_TOKEN=your_token
DATABASE_PATH=./data/images.db
HASH_THRESHOLD=8
```

Each server import writes only start and completion events to `logs/import-<serverId>.log`, including imports triggered when the bot starts.

## Commands

| Command | Description | Permissions |
|---------|-------------|-------------|
| `/dupstats` | Duplicate statistics | Admin |
| `/dupimport` | Re-import images | Admin |
| `/duplogs` | Latest detected duplicates | Admin |

## Architecture

- **pHash**: Perceptual hashing with Hamming distance <= 8
- **SQLite**: Hash and metadata storage
- **Sharp**: Image processing
- **Discord.js v14**: Discord interaction

## License

MIT
