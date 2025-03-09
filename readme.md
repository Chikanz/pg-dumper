# PostgreSQL S3/R2 Backup Tool mostly written by claude

Quick + dirty typescript tool for backing up PostgreSQL databases to S3 since the built in fly backup tool doesn't work on really big or really small databases.

## Features

- **Backup streaming**: Databases are streamed directly to S3 so you don't blow out the ephemeral disk limit on fly
- **Multiple PostgreSQL versions**: Will switch between `pg_dump` versions for 16 + 17
- **Backup retention**: Automatically removes old backups based on retention period

## Usage

### Building + testing locally

```bash
bun install
bun run dev
```

## Configuration

### Env

Needs an env with these vars:

- `AWS_ACCESS_KEY_ID`: Your S3/R2 access key
- `AWS_SECRET_ACCESS_KEY`: Your S3/R2 secret key
- `S3_BUCKET`: Bucket name for backups
- `S3_PREFIX`: Optional prefix for all backups (e.g., "pg-backups")
- `S3_ENDPOINT_URL`: S3-compatible endpoint (for R2 or other providers)

Pro tip: use `fly secrets import < .env` to yeet them onto fly 


Put database connection strings in connections.json

### connections.json Format

```json
[
  {
    "name": "production",
    "connection": "postgres://user:password@host:port/database",
    "folder": "prod/main",
    "retention_days": 90
  },
  {
    "name": "staging",
    "connection": "postgres://user:password@host:port/database",
    "folder": "staging/main",
    "retention_days": 30
  }
]
```

Each database configuration includes:
- `name`: Identifier used in backup filenames
- `connection`: PostgreSQL connection string
- `folder`: Custom folder path in S3/R2 (optional)
- `retention_days`: Number of days to keep backups (default: 30)


### Deploying to Fly.io (app name will need to be changed)

```bash
./deploy.sh
```

