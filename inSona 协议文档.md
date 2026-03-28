# inSona 本地控制协议开发文档



---

## 1. 系统架构

inSona 照明控制系统由以下组件组成：

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   App/第三方 │ ←→ │   网关设备   │ ←→ │  子设备群   │
│  (TCP 客户端) │     │ (桥设备)     │     │ (蓝牙 MESH)  │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                    ┌─────┴─────┐
                    │ 云端/本地  │
                    └───────────┘
```

### 设备类型

| 设备角色 | 说明 |
|----------|------|
| **网关 (桥设备)** | 同时具备蓝牙 + WiFi + 以太网能力，负责协议翻译和信息转发 |
| **子设备** | 仅有蓝牙通信能力，包括灯具、传感器、面板等 |

### 子设备类型代码

| 类型代码 | 设备类型 |
|----------|----------|
| 1984 | 灯具 |
| 1860 | 开合帘 |
| 1861 | 卷帘 |
| 1862 | 开合帘带角度 |
| 1218 | 面板 |
| 1344 | 传感器 |

---

## 2. 快速开始

### 2.1 获取网关 IP

1. 通过 inSona APP 添加网关设备
2. 进入网关页面查看网关设备 IP 地址

### 2.2 建立 TCP 连接

- **端口号**: `8091`
- **协议**: TCP
- **消息分隔符**: `\r\n`

### 2.3 Python 连接示例

```python
from socket import *

HOST = '192.168.1.100'  # 网关 IP
PORT = 8091
BUFSIZ = 1024
ADDR = (HOST, PORT)

tcpCliSock = socket(AF_INET, SOCK_STREAM)
tcpCliSock.connect(ADDR)
```

---

## 3. 消息协议

### 3.1 消息格式

客户端和网关使用 **JSON 格式** 进行交互，基于 TCP 协议传递。

**请求消息基本格式：**

```json
{
  "version": 1,
  "uuid": 1234,
  "type": "all",
  "method": "c.query"
}
```

### 3.2 字段定义

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | integer | 协议版本，目前只有版本 1 |
| `uuid` | integer | 请求 UUID，请求与响应的 uuid 相同，用于匹配 |
| `method` | string | 方法名 |
| `type` | string | 可选，查询类型 |

### 3.3 支持的方法

| 方向 | Method | 说明 | 类型 |
|------|--------|------|------|
| 客户端 → 网关 | `c.query` | 请求 mesh 内设备信息 | 查询 |
| 网关 → 客户端 | `s.query` | 返回 mesh 内设备信息 | 响应 |
| 客户端 → 网关 | `c.control` | 控制设备 | 控制 |
| 网关 → 客户端 | `s.control` | 返回控制结果 | 响应 |
| 网关 → 客户端 | `s.event` | 网关主动通知 | 事件 |
| 客户端 → 网关 | `c.query.scene` | 查询场景列表 | 查询 |
| 网关 → 客户端 | `s.query.scene` | 返回场景列表 | 响应 |

---

## 4. 设备同步

### 4.1 客户端发起同步请求

```json
{
  "version": 1,
  "uuid": 1234,
  "type": "all",
  "method": "c.query"
}
```

### 4.2 服务端返回设备信息

```json
{
  "version": 1,
  "uuid": 1234,
  "method": "s.query",
  "result": "ok",
  "rooms": [
    {
      "roomId": 6,
      "name": "办公区"
    },
    {
      "roomId": 14,
      "name": "会议室"
    }
  ],
  "devices": [
    {
      "did": "ECC57F10015800",
      "pid": 3,
      "ver": "61719",
      "type": 1984,
      "alive": 1,
      "roomId": 2,
      "meshid":"12121213",
      "name": "左",
      "func": 0,
      "funcs": [],
      "value": []
    }
  ]
}
```

### 4.3 设备字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `did` | string | 设备唯一标识 |
| `pid` | integer | 产品型号 |
| `ver` | string | 软件版本 |
| `type` | integer | 设备类型 (见上方设备类型代码表) |
| `alive` | integer | 在线状态 (1=在线，0=不在线) |
| `name` | string | 设备名称 (APP 内修改) |
| `roomId` | integer | 所属房间 ID |
| `func` | integer | 功能类型 |
| `funcs` | array | 功能列表 |
| `value` | array | 当前值 |
| `meshid` | string | 网络ID用来区分不同的网络 |


### 4.4 设备功能类型 (func)

| func | 说明 | value 格式 | value 说明 |
|------|------|------------|------------|
| 2 | 只能开关的设备 | 0/1 | 关/开 |
| 3 | 只能调亮度的灯或窗帘 | 0-100 | 当前亮度或位置百分比 |
| 4 | 双色温灯 | 0-100, 0-100 | 亮度百分比，色温百分比 (0=最暖，100=最冷) |
| 5 | HSL 灯 | 0-100, 0-360, 0-100 | 亮度百分比，色相 (0-360)，饱和度 |
| 9 | 面板按键 | N | 按键数量 |
| 10 | 传感器 | - | - |
| 14 | 空调 | 0/1, 1-5/16, 0/1/2/7, 16-30, -10-40 | 开关，风速，模式，设定温度，环境温度 |
| 21 | 地暖 | 0/1, 10-30, -10-40 | 开关，设定温度，环境温度 |
| 24 | 新风 | 0/1, 1-5/16 | 开关，风速 |

**空调模式说明：**
- 风速：1=最小，5=最大，16=自动
- 模式：0=通风，1=制热，2=制冷，7=除湿

---

## 5. 设备控制

### 5.1 控制请求格式

```json
{
  "version": 1,
  "uuid": 1,
  "method": "c.control",
  "did": "F0ACD777770300",
  "meshid":"12121213",
  "action": "onoff",
  "value": [0],
  "transition": 0
}
```

### 5.2 控制字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `did` | string | 设备唯一标识 |
| `action` | string | 控制类型 |
| `meshid` | string | 控制指定的网络 |
| `value` | int[] | 控制参数 |
| `transition` | int | 渐变时间 (毫秒)，0 表示默认 |

### 5.3 Action 和 Value 对照表

| action (value 长度) | value | 含义 |
|---------------------|-------|------|
| `onoff` (1) | 0/1 | 开关 |
| `level` (1) | 0-100 | 调节亮度或窗帘百分比 |
| `temperature` (1) | 0-100 | 色温百分比 (0=最暖，100=最冷) |
| `ctl` (2) | 0-100, 0-100 | 亮度百分比，色温百分比 |
| `hsl` (3) | 0-100, 0-360, 0-100 | 亮度百分比，色相，饱和度 |
| `scene` (1) | 0-255 | 触发场景号 |
| `curtainStop` (0) | NA | 窗帘停止 |

### 5.4 控制示例

**关闭设备：**
```json
{
  "version": 1,
  "uuid": 1,
  "method": "c.control",
  "did": "F0ACD777770300",
  "action": "onoff",
  "meshid":"12121213",
  "value": [0],
  "transition": 0
}
```

**调节组设备亮度到 30%：**
```json
{
  "version": 1,
  "uuid": 1,
  "method": "c.control",
  "meshid":"12121213",
  "did": "a0",
  "action": "level",
  "value": [30],
  "transition": 0
}
```

---

## 6. 事件处理 (Event)

网关会主动上报事件，客户端需监听处理。

### 6.1 事件类型

| evt 值 | 含义 |
|--------|------|
| `meshchange` | 配置或在线状态变化，客户端需重新发送 `c.query` 同步设备 |
| `status` | 设备状态改变 |
| `sensor` | 传感器检测状态变化 |
| `switch.key` | 按键事件 |
| `scene.recall` | 触发场景 |
| `heartbeat` | 心跳包 (1 分钟发一次) |

### 6.2 事件示例

**设备状态改变 - 关闭：**
```json
{
  "version": 1,
  "uuid": 14,
  "method": "s.event",
  "evt": "status",
  "did": "F0ACD777770300",
  "func": 2,
  "value": [0]
}
```

**设备状态改变 - 亮度色温调整：**
```json
{
  "version": 1,
  "uuid": 16,
  "method": "s.event",
  "evt": "status",
  "did": "F0ACD777770300",
  "func": 4,
  "value": [15, 50]
}
```

---

## 7. 场景控制

### 7.1 同步场景数据

**请求：**
```json
{
  "version": 1,
  "uuid": 1234,
  "method": "c.query.scene"
}
```

**响应：**
```json
{
  "version": 1,
  "uuid": 0,
  "method": "s.query.scene",
  "scenes": [
    {
      "sceneId": 2,
      "name": "喝茶"
    },
    {
      "sceneId": 4,
      "name": "会议"
    }
  ]
}
```

### 7.2 场景控制请求

```json
{
  "version": 1,
  "uuid": 1,
  "method": "c.control",
  "action": "scene",
  "value": [33],
  "transition": 0
}
```

---

## 8. 完整代码示例

### 8.1 Python 示例

```python
import socket
import json

def connect_gateway(ip, port=8091):
    """连接网关"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((ip, port))
    return sock

def send_query(sock, uuid):
    """发送查询请求"""
    query = {
        "version": 1,
        "uuid": uuid,
        "type": "all",
        "method": "c.query"
    }
    sock.send(json.dumps(query).encode() + b'\r\n')
    return json.loads(sock.recv(1024).decode())

def control_device(sock, uuid, did, action, value, transition=0):
    """控制设备"""
    cmd = {
        "version": 1,
        "uuid": uuid,
        "method": "c.control",
        "did": did,
        "action": action,
        "value": value,
        "transition": transition
    }
    sock.send(json.dumps(cmd).encode() + b'\r\n')
    return json.loads(sock.recv(1024).decode())

# 使用示例
sock = connect_gateway('192.168.1.100')
devices = send_query(sock, 1)
control_device(sock, 2, 'F0ACD777770300', 'onoff', [1])
```

### 8.2 JavaScript 示例 (Node.js)

```javascript
const net = require('net');

const client = new net.Socket();

client.connect(8091, '192.168.1.100', () => {
    console.log('Connected to gateway');
    
    const query = {
        version: 1,
        uuid: Date.now(),
        type: 'all',
        method: 'c.query'
    };
    
    client.write(JSON.stringify(query) + '\r\n');
});

client.on('data', (data) => {
    console.log('Received:', data.toString());
});
```

---

## 9. 协议版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| V1 | - | 用户通过 TCP 会话并请求与网络相关的信息 |
| V2 | 2020.1210 | 添加传感器支持 |
| V3 | 2021.423 | 增加场景数据和控制支持 |
| V4 | 2021.526 | 增加面板按键数量标识，开关灯亮度色温反馈 |

---

## 10. 开发注意事项

1. **连接保持**: 建议保持长连接，监听 `heartbeat` 事件确认连接状态
2. **设备同步**: 收到 `meshchange` 事件后需重新查询设备列表
3. **UUID 匹配**: 请求和响应的 `uuid` 字段相同，可用于匹配异步响应
4. **组控制**: `did` 字段支持组 ID (如 `a0`)，可对组内所有设备批量控制
5. **渐变时间**: `transition` 单位为毫秒，0 表示使用设备默认值
6. **meshid**: 需要根据meshid来做汇总，同样的meshid设备放置到一个网络区域内，方便管理
