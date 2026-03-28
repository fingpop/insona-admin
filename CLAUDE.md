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
