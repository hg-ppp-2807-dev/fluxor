FROM node:20-alpine AS builder
WORKDIR /app

# Accept build args for URLs
ARG VITE_WS_URL=ws://localhost:8080/ws
ARG VITE_LB_URL=http://localhost:8080

# Set them as environment variables for build time
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_LB_URL=${VITE_LB_URL}

COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
