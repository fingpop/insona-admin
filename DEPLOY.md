# 商照管理后台 — 服务器部署指南

## 前置条件

- 服务器已安装 **Docker** 和 **Docker Compose** (v2+)
- 服务器与 inSona 网关在同一网络（TCP 8091 可达）
- Node.js **不需要**安装在宿主机（容器内自带）

## 1. 克隆项目

```bash
git clone <repo-url> insona-admin
cd insona-admin
```

## 2. 配置环境变量

```bash
cp .env.example .env
nano .env
```

编辑 `.env` 中的关键值：

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | SQLite 数据库路径（容器内路径） | `file:/app/data/dev.db` |
| `GATEWAY_IP` | inSona 网关 IP 地址 | `192.168.1.100` |
| `GATEWAY_PORT` | inSona 网关端口 | `8091` |

## 3. 构建并运行

```bash
docker compose up -d --build
```

首次构建需要 2-5 分钟（下载依赖、编译 Next.js）。

## 4. 验证部署

```bash
# 检查容器状态
docker compose ps

# 查看日志
docker compose logs -f

# 测试 HTTP 响应
curl http://localhost:3000

# 验证 Prisma 客户端可用
docker compose exec insona-admin npx prisma --version
```

浏览器访问 `http://<服务器IP>:3000`

## 5. 数据持久化

SQLite 数据库文件存储在 `./data/dev.db`（宿主机路径），映射到容器内 `/app/data/dev.db`。

容器重启或删除重建后，数据不会丢失。

**备份数据库：**
```bash
cp ./data/dev.db ./data/dev.db.backup.$(date +%Y%m%d)
```

**恢复数据库：**
```bash
cp ./data/dev.db.backup.20260414 ./data/dev.db
docker compose restart
```

## 6. 常用运维操作

### 查看日志
```bash
docker compose logs -f           # 实时日志
docker compose logs --tail=100   # 最近 100 行
```

### 重启服务
```bash
docker compose restart
```

### 更新代码并重新部署
```bash
git pull
docker compose up -d --build
```

### 停止服务
```bash
docker compose down
```

### 进入容器执行命令
```bash
docker compose exec insona-admin sh
```

### 数据库管理（容器内）
```bash
# 查看数据库文件
docker compose exec insona-admin ls -la /app/data/

# 运行 Prisma Studio（需要映射端口）
docker compose exec insona-admin npx prisma studio
```

## 7. 故障排查

### 网关无法连接
```bash
# 从容器内测试网络连通性
docker compose exec insona-admin nc -zv 192.168.1.100 8091
```
确认网关 IP 正确，且防火墙允许 8091 端口出站。

### 数据库不持久化
确认 `docker-compose.yml` 中的 volumes 配置正确：
```yaml
volumes:
  - ./data:/app/data
```
确认 `./data` 目录存在且有写权限：`mkdir -p ./data && chmod 755 ./data`

### 容器启动后立即退出
```bash
docker compose logs --tail=50
```
常见原因：Prisma 迁移失败、端口被占用、.env 配置错误。

### 端口冲突
如果 3000 端口已被占用，修改 `docker-compose.yml` 中的端口映射：
```yaml
ports:
  - "3001:3000"
```

### 镜像体积过大
确保使用了多阶段构建（Dockerfile 已配置），standalone 模式输出。
正常体积应在 300-500MB 之间。

## 架构说明

- **Next.js 15** App Router，standalone 输出模式
- **SQLite** 单文件数据库，通过 volume 持久化
- **inSona 网关** 通过 TCP 8091 连接（容器需能访问网关 IP）
- **后台调度器** 通过 instrumentation hook 自动启动，每 60 秒检查定时任务
- 容器启动时自动执行 `prisma migrate deploy` 确保数据库 schema 最新
