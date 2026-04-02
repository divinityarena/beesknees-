FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server.js ./
COPY index.html ./
COPY about.html ./

EXPOSE 3000

CMD ["node", "server.js"]
