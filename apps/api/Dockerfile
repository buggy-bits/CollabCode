FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json .
COPY apps/api/package.json ./apps/api/
COPY packages/*/package.json ./packages/
COPY packages/typescript-config ./packages/typescript-config

# Install dependencies
ENV HUSKY=0

RUN npm install -g npm@latest
RUN cd apps/api && npm install 

# Copy remaining source code
COPY apps/api ./apps/api

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["npm", "run", "dev"]