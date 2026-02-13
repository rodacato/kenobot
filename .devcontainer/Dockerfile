FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    jq \
    nano \
    vim-tiny \
    openssl \
    sqlite3 \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Give node user sudo access (needed for occasional system tasks)
RUN echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/node

# Install Gemini CLI globally as root
RUN npm install -g @google/gemini-cli

# Fix permissions for global node modules
RUN chown -R node:node /usr/local/lib/node_modules
RUN chown -R node:node /usr/local/bin

# Switch to node user for all subsequent operations
USER node

# Install Claude Code CLI as node user (native installer)
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/home/node/.local/bin:${PATH}"
