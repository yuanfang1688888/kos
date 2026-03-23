FROM node:18-alpine

WORKDIR /app

# 安装 better-sqlite3 编译依赖
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install --production

COPY . .

# 数据持久化目录
RUN mkdir -p /app/uploads /app/public/qrcodes

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", "server.js"]
