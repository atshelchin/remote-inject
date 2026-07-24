# Remote Inject

> 在任意桌面 dApp 上使用你的手机钱包 —— 基于开放的 [WalletPair](https://walletpair.org) 协议、无需注册的浏览器桥接扩展。

[English](./README.md)

## 这是什么？

Remote Inject 是一个 Chromium 扩展，它让任意桌面 dApp 以为本地装有钱包，而真正的签名发生在你的手机上。
它向页面注入一个 EIP-1193 / EIP-6963 provider，并把每一个请求通过端到端加密的通道转发到你的手机钱包。

你扫描二维码进行配对，二维码会在手机钱包内置的 dApp 浏览器中打开 **Remote Inject bridge 页面**。
该页面就是 WalletPair 的**钱包**侧——它包裹你钱包自身的 `window.ethereum` 并在其中签名——
因此 Remote Inject 兼容**任意带有 dApp 浏览器的手机钱包**（MetaMask、OKX、TokenPocket、imToken、Trust 等），
而不只是原生支持 WalletPair 的钱包。

传输层是开放的、端到端加密的 **WalletPair 协议**，走一台公共 WebSocket 中继。
无需自建服务器，也无需注册任何账号。

```
┌─────────────────┐   EIP-1193    ┌─────────────────┐    WalletPair     ┌─────────────────┐
│    桌面 dApp    │◄─────────────►│  Remote Inject  │◄─── 加密中继 ────►│    手机钱包     │
│   （任意网站）  │  window.eth   │   （扩展程序）  │   WebSocket relay │ （WalletPair）  │
│                 │               │   后台 Worker   │  relay.walletpair │    私钥在本机    │
└─────────────────┘               └─────────────────┘       .org        └─────────────────┘
```

- 扩展**不持有任何密钥材料** —— 只转发加密后的 EIP-1193 消息。
- 中继能看到连接元数据（dApp 的名称/URL/图标、双方的公钥，以及每一帧的链 ID），但**永远看不到你的明文消息或密钥** —— 负载由 ChaCha20-Poly1305 加密封装。
- 一个四位配对码（在两台设备上核对一致）用于将扩展（dApp 侧）认证给你的钱包。

## 为什么？

| WalletConnect | Remote Inject |
| --- | --- |
| 需要 project ID / 注册 | 无需注册、无需 API key |
| 将 project ID 绑定到托管中继服务 | 任意无状态 WalletPair 中继，公共或自建 |
| 多层会话协议 | 一条 WebSocket + 一种 AEAD 帧格式 |
| 钱包必须实现 WalletConnect | 任意带 dApp 浏览器的手机钱包（通过 bridge 页面） |

## 安装

Remote Inject 是 Chromium（MV3）扩展。Chrome 应用商店上架中；在此之前，请以“加载已解压的扩展程序”方式安装：

1. 从 [GitHub Releases](https://github.com/atshelchin/remote-inject/releases) 下载最新 `.zip` 并解压。
2. 打开 `chrome://extensions`，启用**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择解压后的 `chrome-mv3` 目录。

随后打开任意 dApp，点击连接，选择 **Remote Inject**，用 WalletPair 手机钱包扫描二维码，
并确认四位配对码一致即可。

完整指南：[remoteinject.org/install](https://remoteinject.org/install)。

## WalletPair 协议

Remote Inject 原样实现 WalletPair 协议。规范文档维护在 [walletpair.org](https://walletpair.org)：

| 层 | 定义内容 | 规范 |
| --- | --- | --- |
| 加密 | 二维码配对、X25519 + HKDF 密钥调度、四位配对码、ChaCha20-Poly1305 帧 | [core-concepts](https://walletpair.org/docs/core-concepts) |
| 中继 | 无状态的 `/v1` WebSocket、`channel_joined`、不透明帧转发 | [relay](https://walletpair.org/docs/relay) |
| 以太坊 | EIP-1193 provider 接口、支持的方法、事件、错误码 | [evm-methods](https://walletpair.org/docs/evm-methods) |

默认中继为 `wss://relay.walletpair.org/v1`。你可以在扩展的“设置”面板中改用任意
WalletPair 中继，或[自建中继](https://walletpair.org/docs/relay)。

## 项目结构

```
remote-inject/
├── packages/
│   ├── chrome-extension/     # Remote Inject 浏览器扩展（WXT + Svelte，MV3）
│   │   └── src/
│   │       ├── lib/walletpair/   # WalletPair 协议核心（crypto、relay、session、msgpack）
│   │       ├── lib/protocols/    # EIP-1193 / 以太坊协议处理
│   │       ├── entrypoints/      # 后台 SW、内容桥、MAIN world provider、popup、sidepanel、confirm
│   │       └── components/       # Svelte UI
│   │
│   └── remoteinject.org/     # 官网 + 文档（SvelteKit，部署于 Cloudflare Workers）
│
├── docs/                     # 应用商店文案、提交说明、隐私政策
└── README.md
```

**没有 server 包** —— 协议走托管的 WalletPair 中继。**没有 SDK 包** ——
dApp 通过标准的 EIP-1193 / EIP-6963 provider 与扩展交互，钱包接入方直接实现
WalletPair 协议（参见 [walletpair.org](https://walletpair.org)）。

## 开发

```bash
# 安装（Bun workspace）
bun install

# 浏览器扩展 —— 开发、构建、测试
cd packages/chrome-extension
bun run dev            # WXT 开发服务器
bun run build          # 生产构建 → .output/chrome-mv3
bun run zip            # 打包发布用 .zip
bun run test           # 协议 + provider 单元测试（Vitest）
bun run check          # svelte-check

# 官网 —— 开发、构建
cd packages/remoteinject.org
bun run dev
bun run build
```

## 支持的钱包

任何带有 dApp 浏览器的手机钱包（MetaMask、OKX、TokenPocket、imToken、Trust 等）——
你在其中打开 bridge 页面即可。原生支持 WalletPair 的钱包也可直接扫描配对 URI。
扩展是配对中的 **dApp 侧**；你的手机（通过 bridge 页面）运行**钱包侧**。

## 许可证

MIT —— 让钱包连接回归开放与自由。
