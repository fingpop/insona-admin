# 商照管理后台 — 服务器部署指南

## 前置条件

- 服务器已安装 **Docker** 和 **Docker Compose** (v2+)
- 服务器与 inSona 网关在同一网络（TCP 8091 可达）
- Node.js **不需要**安装在宿主机（容器内自带）

## 快速部署（推荐）

项目提供一键部署脚本 `scripts/deploy.sh`，自动完成从克隆代码到启动验证的完整流程。

### 使用方法

```bash
sudo bash scripts/deploy.sh
```

### 脚本自动执行的步骤

1. **检查前置条件** — 验证 docker、docker compose、git 是否已安装
2. **交互式配置** — 提示输入网关 IP、端口、部署目录、仓库地址
   - 自动检测服务器网络接口 IP 作为参考
   - GATEWAY_PORT 默认 8091，DEPLOY_DIR 默认 /opt/insona-admin
3. **克隆代码** — 如提供仓库地址则自动 clone，否则使用已有目录
4. **生成 .env** — 根据交互输入自动生成配置文件
5. **创建目录** — 自动创建 `./data` 和 `./data/logs` 目录
6. **构建启动** — 执行 `docker compose up -d --build`
7. **健康检查** — 等待服务就绪（最长 120 秒），支持 docker compose 状态和 HTTP 响应检测
8. **部署报告** — 输出访问 URL、容器状态和后续步骤提示

### 后续配置

部署成功后，脚本会提示以下可选配置：

- **日志轮转** — 防止日志无限增长（参见 [第 9 节](#9-日志管理)）
- **开机自启** — 通过 systemd 实现容器自动启动（参见 [第 8 节](#8-开机自启动)）

---

## 手动部署步骤（备选方案）

> 以下为完整手动部署流程。如已使用快速部署脚本，可跳过此部分。

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

> 完整日志管理说明参见 [第 9 节 - 日志管理](#9-日志管理)。

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

## 8. 开机自启动

应用支持通过 systemd 实现开机自启动，使用项目提供的 `deploy/insona-admin.service` 单元文件。

### 启用自启动

```bash
# 复制 systemd 服务文件（假设项目已部署到 /opt/insona-admin）
sudo cp deploy/insona-admin.service /etc/systemd/system/

# 重载 systemd 并启用自启动
sudo systemctl daemon-reload
sudo systemctl enable insona-admin
sudo systemctl start insona-admin

# 验证服务状态
sudo systemctl status insona-admin
```

### 服务管理

```bash
sudo systemctl stop insona-admin      # 停止服务
sudo systemctl restart insona-admin   # 重启服务
sudo systemctl disable insona-admin   # 禁用自启动
```

### 注意事项

- 服务文件中的 `WorkingDirectory` 设为 `/opt/insona-admin`，确保项目部署到此路径，或修改服务文件匹配实际路径
- `After=docker.service` 确保 Docker 引擎就绪后再启动容器

## 9. 日志管理

### 日志输出路径

应用所有日志通过 `console.log` 输出到 stdout，Docker 自动捕获。通过以下命令查看：

```bash
# 查看应用日志（Docker）
docker compose logs -f insona-admin

# 通过 systemd 查看日志（使用自启动服务时）
sudo journalctl -u insona-admin -f
```

### 预期启动日志输出

容器启动时应看到以下关键日志：

```
[Instrumentation] 服务器启动中...
[Instrumentation] 后台服务已启动
[Gateway] Connecting to 192.168.1.100:8091...
```

- `[Instrumentation] 服务器启动中...` — Next.js 服务器初始化（instrumentation.ts）
- `[Instrumentation] 后台服务已启动` — 定时任务调度器启动
- `[Gateway] Connecting to {ip}:{port}...` — 网关连接尝试

### 日志轮转

生产环境建议配置日志轮转，防止日志文件无限增长。能耗事件日志输出到 `/app/data/logs/energy.log`，项目提供 logrotate 配置文件。

```bash
# 安装 logrotate 配置
sudo cp deploy/logrotate.conf /etc/logrotate.d/insona-admin

# 验证配置（dry run）
sudo logrotate -d /etc/logrotate.d/insona-admin
```

logrotate 配置说明（参见 `deploy/logrotate.conf`）：
- **每日轮转**（daily），保留 30 天
- 自动压缩旧日志（compress），延迟压缩当前文件（delaycompress）
- 使用 `copytruncate` 模式，Node.js 进程持有文件描述符时安全轮转

### 日志排查

```bash
# 查看最近 100 行
docker compose logs --tail=100 insona-admin

# 查看 systemd 日志
sudo journalctl -u insona-admin --since "1 hour ago"
```

## 架构说明

- **Next.js 15** App Router，standalone 输出模式
- **SQLite** 单文件数据库，通过 volume 持久化
- **inSona 网关** 通过 TCP 8091 连接（容器需能访问网关 IP）
- **后台调度器** 通过 instrumentation hook 自动启动，每 60 秒检查定时任务
- 容器启动时自动执行 `prisma migrate deploy` 确保数据库 schema 最新
