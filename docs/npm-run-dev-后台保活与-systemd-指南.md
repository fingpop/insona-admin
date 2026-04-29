# `npm run dev` 后台保活与 `systemd` 使用指南

本文档用于在 Linux 服务器上以 `npm run dev` 的方式后台运行当前项目，并提供基础保活能力与 `systemd` 开机自启配置。

## 1. 新增脚本

项目已新增脚本：

```bash
scripts/dev-keepalive.sh
```

脚本支持以下命令：

```bash
bash scripts/dev-keepalive.sh start
bash scripts/dev-keepalive.sh stop
bash scripts/dev-keepalive.sh restart
bash scripts/dev-keepalive.sh status
bash scripts/dev-keepalive.sh logs
```

说明：

- `start`：后台启动 `npm run dev`
- `run`：前台运行保活循环，适合给 `systemd` 调用
- `stop`：停止保活进程和 Next.js 子进程
- `status`：查看保活进程和应用进程状态
- `logs`：实时查看日志

## 2. 保活机制说明

脚本内部使用循环方式运行：

1. 启动 `npm run dev`
2. 记录子进程 PID
3. 如果进程异常退出，等待 3 秒后自动拉起
4. 收到停止信号时，先停 supervisor，再停 Next.js 子进程

默认运行数据位置：

- supervisor PID：`data/runtime/dev-keepalive.pid`
- app PID：`data/runtime/dev-app.pid`
- 标准输出日志：`data/logs/dev-keepalive.out.log`
- 错误日志：`data/logs/dev-keepalive.err.log`

## 3. 直接后台启动

进入项目目录后执行：

```bash
bash scripts/dev-keepalive.sh start
```

查看状态：

```bash
bash scripts/dev-keepalive.sh status
```

查看日志：

```bash
bash scripts/dev-keepalive.sh logs
```

停止：

```bash
bash scripts/dev-keepalive.sh stop
```

## 4. 环境要求

服务器需要具备：

- Node.js 20 或兼容版本
- npm
- 项目依赖已安装

建议首次执行：

```bash
npm ci
npx prisma generate
```

如果使用 SQLite，请确认数据库文件路径可写。

## 5. `systemd` 配置方式

推荐让 `systemd` 直接执行脚本的 `run` 模式。

先创建 service 文件：

```bash
sudo nano /etc/systemd/system/insona-dev.service
```

写入以下内容：

```ini
[Unit]
Description=inSona Admin Next.js Dev Service
After=network.target

[Service]
Type=simple
User=YOUR_USER
Group=YOUR_USER
WorkingDirectory=/your/project/path
Environment=NODE_ENV=development
Environment=PORT=3000
ExecStart=/bin/bash /your/project/path/scripts/dev-keepalive.sh run
Restart=always
RestartSec=5
KillMode=control-group
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

需要替换的字段：

- `YOUR_USER`：实际运行项目的 Linux 用户
- `/your/project/path`：项目实际部署目录

## 6. 启用 `systemd`

```bash
sudo systemctl daemon-reload
sudo systemctl enable insona-dev
sudo systemctl start insona-dev
```

查看状态：

```bash
sudo systemctl status insona-dev
```

查看日志：

```bash
sudo journalctl -u insona-dev -f
```

重启：

```bash
sudo systemctl restart insona-dev
```

停止：

```bash
sudo systemctl stop insona-dev
```

禁用开机自启：

```bash
sudo systemctl disable insona-dev
```

## 7. 更新代码后的操作

如果只是更新项目代码，建议流程：

```bash
cd /your/project/path
git pull
npm ci
npx prisma generate
sudo systemctl restart insona-dev
```

如果依赖未变化，也可以只执行：

```bash
git pull
sudo systemctl restart insona-dev
```

## 8. 端口与权限注意事项

- 默认端口是 `3000`
- 如需修改端口，可以在 `systemd` 里调整 `Environment=PORT=3000`
- 如需绑定 `1024` 以下端口，建议用 Nginx 反向代理，而不是直接让 `npm run dev` 监听低位端口

## 9. 建议

`npm run dev` 适合：

- 内网测试环境
- 临时演示环境
- 需要快速修改和验证的机器

不建议长期生产环境继续使用 `npm run dev`。正式环境更推荐：

- `npm run build`
- `npm run start`
- 或 Docker / PM2 / systemd 配合生产构建产物启动
