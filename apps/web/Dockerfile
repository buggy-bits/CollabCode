FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json .
COPY apps/web/package.json ./apps/web/
COPY packages/*/package.json ./packages/
COPY packages/typescript-config ./packages/typescript-config

# Install dependencies
ENV HUSKY=0
RUN npm install -g npm@latest
RUN cd apps/web && npm install

# Copy remaining source code
COPY apps/web ./apps/web

WORKDIR /app/apps/web

EXPOSE 5173 

CMD ["npm", "run", "dev"] 