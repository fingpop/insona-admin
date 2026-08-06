# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Type

Documentation-only repository containing the inSona Local Control Protocol specification (inSona 本地控制协议开发文档).

## Contents

- **inSona 协议文档.md** - Complete protocol specification for inSona smart lighting control system

## Repository Structure

Single markdown document describing the inSona TCP-based control protocol. No source code, build system, or CI/CD.

## Protocol Overview

| Item | Value |
|------|-------|
| Transport | TCP |
| Port | 8091 |
| Message format | JSON, delimited by `\r\n` |
| Communication | Bidirectional (client requests + server events) |

## Key Topics in Documentation

- System architecture: Gateway (WiFi/Bluetooth bridge) + Sub-devices (Bluetooth Mesh)
- Device types: lights (1984), curtains (1860/1861/1862), panels (1218), sensors (1344)
- Device synchronization: `c.query` / `s.query`
- Device control: `c.control` / `s.control`
- Event handling: status changes, heartbeats, mesh topology changes
- Scene management
- Function types: on/off, dimming, color temperature, HSL, RGB
- Code examples in Python and JavaScript

## 控制页面（control）结构规范

所有控制页面功能以 Tab 形式组织在 `/control` 路由下，**不产生独立路由**。

### 文件结构
- `control/page.tsx` — 主壳组件 `ControlPanel`，负责状态管理、数据加载、Tab 条件渲染
- `control/types.ts` — 共享类型定义（DbDevice, SpaceNode, Scene, SceneAction）
- `control/utils.ts` — 共享工具函数（resolveDeviceFunc, toInSonaDevice 等）
- `control/sidebar.tsx` / `header.tsx` / `device-drawer.tsx` — 公共 UI 组件
- `control/tabs/*.tsx` — 各 Tab 页面组件（每个 Tab 一个文件）

### 新增功能规则
- 新增 Tab 页面 → 在 `control/tabs/` 下创建新文件，在 `page.tsx` 中添加条件渲染
- 修改某个 Tab → 直接编辑对应的 `tabs/*.tsx` 文件，**不要在 `page.tsx` 中修改**
- 新增公共组件 → 视情况放在 `control/` 根目录或 `control/tabs/` 内
- 新增共享类型 → 添加到 `control/types.ts`
- 新增工具函数 → 添加到 `control/utils.ts`