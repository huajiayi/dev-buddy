# Dev Buddy

Dev Buddy 是一个服务器、数据库与云账号管理后台。SSH 交互终端依赖项目自带的常驻 Node.js WebSocket 服务，因此生产环境推荐使用 Docker Compose 部署。

## Docker Compose 部署

### 1. 准备环境变量

复制示例文件并填写真实配置：

```bash
cp .env.example .env
```

至少需要配置 PostgreSQL：

```dotenv
POSTGRESQL_HOST=数据库地址
POSTGRESQL_PORT=5432
POSTGRESQL_USERNAME=postgres
POSTGRESQL_PASSWORD=数据库密码
POSTGRESQL_DATABASE=dev_buddy
POSTGRESQL_SSL=false
```

如果 PostgreSQL 运行在同一台 Docker 宿主机上，请将 `POSTGRESQL_HOST` 设置为 `host.docker.internal`，不要使用 `127.0.0.1`。Linux 环境所需的宿主机映射已经写入 Compose。

生产环境还应设置两个长期稳定的随机密钥：

```dotenv
TERMINAL_TICKET_SECRET=至少32位随机字符串
ALIYUN_CREDENTIALS_ENCRYPTION_KEY=至少32位随机字符串
```

`ALIYUN_CREDENTIALS_ENCRYPTION_KEY` 用于加密服务器私钥、数据库密码、阿里云凭据和系统默认密码。已有数据后不要随意更换，否则已保存的密文将无法解密。

### 2. 构建并启动

```bash
docker compose up -d --build
```

查看运行状态和日志：

```bash
docker compose ps
docker compose logs -f dev-buddy
```

默认访问地址为 `http://服务器地址:3000`。如需修改宿主机端口：

```dotenv
DEV_BUDDY_PORT=8080
```

### 3. 更新版本

```bash
git pull
docker compose up -d --build
```

停止服务：

```bash
docker compose down
```

## HTTPS 与 WebSocket 反向代理

正式环境建议在容器前使用 Nginx 或 Caddy，并确保 `/ws/ssh-terminal` 的 WebSocket Upgrade 请求被正确转发。Nginx 核心配置如下：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

使用 Lark 登录时，需要同步更新 `.env` 和 Lark 开发者后台中的回调地址：

```dotenv
LARK_REDIRECT_URI=https://你的域名/auth/lark/callback
```

## 本地开发

```bash
pnpm install
pnpm dev
```

本地服务默认运行在 [http://localhost:3000](http://localhost:3000)。
