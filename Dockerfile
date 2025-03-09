# syntax = docker/dockerfile:1

# Adjust BUN_VERSION as desired
ARG BUN_VERSION=1.1.42
FROM oven/bun:${BUN_VERSION}-slim AS base

LABEL fly_launch_runtime="Bun"

# Bun app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules and PostgreSQL clients
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
    build-essential \
    pkg-config \
    python-is-python3 \
    curl \
    gnupg \
    lsb-release \
    ca-certificates

# Add PostgreSQL repository to get multiple versions
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/postgresql.list && \
    apt-get update -qq

# Install node modules
COPY bun.lockb package.json ./
RUN bun install

# Copy application code
COPY . .

# Remove development dependencies
RUN rm -rf node_modules && \
    bun install --ci


# Final stage for app image
FROM base

# Install PostgreSQL client tools and AWS CLI
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
    curl \
    gnupg \
    lsb-release \
    ca-certificates \
    unzip \
    jq && \
    # Add PostgreSQL repository
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/postgresql.list && \
    apt-get update -qq && \
    # Install PostgreSQL clients for multiple versions
    apt-get install --no-install-recommends -y \
    postgresql-client \
    postgresql-client-16 \
    postgresql-client-17

# Create directory for connections file
RUN mkdir -p /app/data

# Copy built application
COPY --from=build /app /app

# Create directories for PostgreSQL version binaries and set up symlinks
RUN mkdir -p /usr/local/bin && \
    ln -sf /usr/lib/postgresql/16/bin/pg_dump /usr/local/bin/pg_dump16 && \
    ln -sf /usr/lib/postgresql/17/bin/pg_dump /usr/local/bin/pg_dump17

RUN ls -la /app/

# Default command now runs the backup instead of starting a web server
CMD [ "bun", "run", "index.ts" ]