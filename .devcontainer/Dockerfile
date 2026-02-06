FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    jq \
    openssl \
    sqlite3 \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Give node user sudo access (needed for occasional system tasks)
RUN echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/node

# Install CLIs globally as root (they'll be accessible to node user)
RUN npm install -g @anthropic-ai/claude-code
RUN npm install -g @google/gemini-cli

# Fix permissions for global node modules
RUN chown -R node:node /usr/local/lib/node_modules
RUN chown -R node:node /usr/local/bin

# Switch to node user for all subsequent operations
USER node
