FROM node:20-alpine

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
