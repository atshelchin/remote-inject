# Chrome Web Store Listing — Remote Inject Bridge

> Copy-paste these into the Chrome Developer Dashboard.

---

## English

### Name (45 chars max)
```
Remote Inject Bridge
```

### Short Description (132 chars max)
```
Use any web3 DApp on desktop while signing with your mobile wallet — no MetaMask or browser wallet required.
```

### Detailed Description
```
Most web3 DApps are built for browser wallet extensions like MetaMask. But what if your assets are on your phone, and you'd rather keep them there?

Remote Inject Bridge solves this. It makes any DApp on your desktop browser work with your mobile wallet — by injecting a virtual wallet provider into the page and forwarding every signing request to your phone in real time.

WHY YOU SHOULD INSTALL IT

• You use a mobile wallet (MetaMask Mobile, Trust Wallet, OKX Wallet, Rabby Mobile, etc.) and want to interact with DApps from your desktop without moving your assets to a browser wallet.

• The DApp you need doesn't support WalletConnect or its WalletConnect integration is broken. Remote Inject works at the browser level, so it's compatible with 100% of EIP-1193 DApps regardless of which wallet connectors they support.

• You want to avoid installing additional browser wallet extensions. One lightweight bridge extension is all you need.

• You're a developer testing a DApp against a real mobile wallet without switching devices.

• You want full control: the relay server can be self-hosted so no third party ever sees your session data.

HOW IT WORKS

1. Open the popup or side panel and connect to a relay server.
2. Scan the QR code with your mobile wallet's built-in DApp browser.
3. Done — the DApp on your desktop now talks directly to your mobile wallet. All transaction approvals, message signing, and chain switches happen on your phone.

The bridge uses Server-Sent Events (SSE) over HTTPS — no WebSocket ports, no local servers, nothing to configure.

FEATURES

• Compatible with any EIP-1193 DApp (Uniswap, OpenSea, Aave, and thousands more)
• Supports MetaMask Mobile, Trust Wallet, OKX Wallet, imToken, and any mobile wallet with a built-in DApp browser
• Side panel mode — keep the bridge visible while you browse
• Auto-reconnect — the bridge restores automatically when you revisit a DApp
• Activity log — track recent signing requests and their outcomes
• Adaptive theme — light/dark mode follows the current webpage automatically
• Bilingual UI — English and 中文 supported
• Self-hostable relay server — full privacy, no lock-in
• Open source: github.com/shelchin/remote-inject

PERMISSIONS

• storage — remembers your relay server URL and session so you don't need to re-scan on every visit
• tabs — reads the page background color to match the popup theme (no page content is read or sent anywhere)
• sidePanel — enables the side panel UI
• offscreen — keeps the SSE connection alive in the background while you switch tabs
```

### Category
```
Productivity
```

### Language
```
English (en)
```

---

## 中文（zh-CN）

### 名称
```
Remote Inject Bridge
```

### 简短描述（最多 132 个字符）
```
在电脑浏览器上使用任意 Web3 DApp，用手机钱包完成签名——无需安装 MetaMask 等浏览器钱包插件。
```

### 详细描述
```
绝大多数 Web3 DApp 都是为 MetaMask 这类浏览器钱包插件设计的。但如果你的资产放在手机钱包里，又不想迁移到浏览器钱包，该怎么办？

Remote Inject Bridge 就是为解决这个问题而生的。它在你的桌面浏览器中注入一个虚拟钱包提供方，将页面上的每一笔签名请求实时转发到你的手机，让任意 DApp 都能配合你的手机钱包使用。

为什么值得安装

• 你使用手机钱包（MetaMask Mobile、Trust Wallet、OKX Wallet、Rabby Mobile 等），想在电脑上操作 DApp，但不想把资产转移到浏览器钱包。

• 你想用的 DApp 不支持 WalletConnect，或者其 WalletConnect 集成不稳定。Remote Inject 直接在浏览器层面工作，兼容 100% 符合 EIP-1193 标准的 DApp，无论该 DApp 支持哪些钱包连接方式。

• 你不想安装额外的浏览器钱包插件。一个轻量级桥接插件就够了。

• 你是开发者，需要在桌面端对真实的手机钱包进行 DApp 测试。

• 你重视隐私：中继服务器可以自部署，没有任何第三方能看到你的会话数据。

工作原理

1. 打开弹窗或侧边栏，连接中继服务器。
2. 用手机钱包内置的 DApp 浏览器扫描二维码。
3. 完成 — 桌面端的 DApp 现在直接与你的手机钱包通信，所有交易确认、消息签名、切链操作均在手机上完成。

桥接通道基于 HTTPS 上的 SSE（Server-Sent Events），无需 WebSocket 端口，无需本地服务器，零配置。

功能特性

• 兼容所有符合 EIP-1193 标准的 DApp（Uniswap、OpenSea、Aave 等数千个）
• 支持 MetaMask Mobile、Trust Wallet、OKX Wallet、imToken 及所有带内置 DApp 浏览器的手机钱包
• 侧边栏模式 — 浏览网页时保持桥接面板常驻
• 自动重连 — 回到 DApp 时自动恢复连接，无需重新扫码
• 操作日志 — 实时查看签名请求及其状态
• 自适应主题 — 亮色/暗色模式自动跟随当前网页切换
• 中英双语界面
• 中继服务器可自部署 — 完全掌控数据，不依赖任何第三方
• 开源：github.com/shelchin/remote-inject

权限说明

• storage — 记住中继服务器地址和会话信息，下次访问 DApp 无需重新扫码
• tabs — 读取当前页面背景色以匹配弹窗主题（不读取也不上传任何页面内容）
• sidePanel — 启用侧边栏模式
• offscreen — 在你切换标签页时保持 SSE 连接不断线
```
