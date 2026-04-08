FROM node:20-bookworm-slim

# Install Python 3.11, pip, venv
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv python3-full && \
    rm -rf /var/lib/apt/lists/*

# Create venv for scraper, install deps inside it
RUN python3 -m venv /app/scraper-venv

# Alias python/pip to the venv
ENV PATH="/app/scraper-venv/bin:$PATH"

WORKDIR /app/backend

# Install Node dependencies
COPY backend/package*.json ./
RUN npm install

# Install Python dependencies inside venv
COPY scraper/requirements.txt /app/scraper/
RUN pip install --no-cache-dir -r /app/scraper/requirements.txt

# Copy source code
COPY backend/ ./
COPY scraper/ /app/scraper/

EXPOSE 4000

CMD ["npm", "start"]
