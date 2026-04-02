# Stage 1: backend deps
FROM node:22-alpine AS backend-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: frontend build
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 3: runtime
FROM node:22-alpine
WORKDIR /app
COPY --from=backend-deps /app/node_modules ./node_modules
COPY --from=frontend-build /app/dist ./dist
COPY server.js ./
COPY workouts.json ./
ENV NODE_ENV=production
EXPOSE 4218
CMD ["node", "server.js"]
