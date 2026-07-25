# Chrome Web Store Listing — Remote Inject

> Copy-paste these into the Chrome Developer Dashboard.

---

## English

### Name (45 chars max)
```
Remote Inject
```

### Short Description (132 chars max)
```
Use any web3 dApp on desktop while signing with your mobile wallet — end-to-end encrypted, no browser wallet required.
```

### Detailed Description
```
Most web3 dApps are built for browser wallet extensions like MetaMask. But what if your assets live on your phone, and you'd rather keep them there?

Remote Inject makes any dApp on your desktop browser work with your mobile wallet. It injects a standard wallet provider into the page and tunnels every signing request to your phone over the open, end-to-end encrypted WalletPair protocol — no registration, no middleman, no keys on your desktop.

WHY YOU SHOULD INSTALL IT

• You use a mobile wallet with a built-in dApp browser (MetaMask, OKX, TokenPocket, imToken, Trust…) and want to interact with dApps from your desktop without moving your assets to a browser wallet.

• You want to avoid installing another browser wallet extension. One lightweight bridge is all you need.

• You care about privacy: the relay forwards encrypted frames and sees only connection metadata — never your plaintext — and you can self-host it.

• You're a developer testing a dApp against a real mobile wallet without switching devices.

HOW IT WORKS

1. Open any dApp and click connect. Choose Remote Inject.
2. Scan the QR code shown in the side panel with your mobile wallet — it opens the Remote Inject bridge page inside the wallet.
3. Confirm the four-digit pairing code matches on both devices.
4. Done — the dApp now talks to your mobile wallet. Every approval, message signature, and chain switch happens on your phone.

The channel is end-to-end encrypted with ChaCha20-Poly1305 over a single WebSocket relay. The relay cannot read your data.

FEATURES

• Works with any EIP-1193 / EIP-6963 dApp (Uniswap, Aave, Polymarket, and thousands more)
• Works with any mobile wallet that has a built-in dApp browser — you open the bridge page inside it
• Side panel mode — keep the pairing and status visible while you browse
• Auto-reconnect — the encrypted session restores automatically when you revisit a dApp
• Activity log — review recent signing requests and their outcomes
• Per-origin permissions — each site you connect is authorized individually
• Public or self-hosted relay — default wss://relay.walletpair.org/v1, or point it at your own
• Open source: github.com/atshelchin/remote-inject

PERMISSIONS

• storage — remembers your relay URL, encrypted session state, and authorized origins so you don't re-scan on every visit
• sidePanel — shows the pairing QR code and connection status
• alarms — keeps the encrypted channel alive and reconnects after the service worker sleeps
• host access (all sites) — injects the wallet provider into dApp pages so they can request a connection
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
Remote Inject
```

### 简短描述（最多 132 个字符）
```
在电脑浏览器上使用任意 Web3 dApp，用手机钱包端到端加密地完成签名——无需安装浏览器钱包插件。
```

### 详细描述
```
绝大多数 Web3 dApp 都是为 MetaMask 这类浏览器钱包插件设计的。但如果你的资产放在手机钱包里，又不想迁移到浏览器钱包，该怎么办？

Remote Inject 让任意桌面浏览器中的 dApp 都能配合你的手机钱包使用。它在页面中注入一个标准钱包 provider，并通过开放、端到端加密的 WalletPair 协议把每一笔签名请求转发到你的手机——无需注册、没有中间人、桌面端不保存任何密钥。

为什么值得安装

• 你使用带有 dApp 浏览器的手机钱包（MetaMask、OKX、TokenPocket、imToken、Trust 等），想在电脑上操作 dApp，但不想把资产转移到浏览器钱包。

• 你不想再安装一个浏览器钱包插件。一个轻量级桥接插件就够了。

• 你重视隐私：中继只转发加密帧、只能看到连接元数据（看不到明文），而且可以自部署。

• 你是开发者，需要在桌面端对真实的手机钱包进行 dApp 测试。

工作原理

1. 打开任意 dApp，点击连接，选择 Remote Inject。
2. 用手机钱包扫描侧边栏中的二维码——它会在钱包内打开 Remote Inject bridge 页面。
3. 核对两台设备上的四位配对码是否一致。
4. 完成——dApp 现在直接与你的手机钱包通信，所有交易确认、消息签名、切链操作均在手机上完成。

通道使用 ChaCha20-Poly1305 端到端加密，走单条 WebSocket 中继，中继无法读取你的数据。

功能特性

• 兼容所有 EIP-1193 / EIP-6963 dApp（Uniswap、Aave、Polymarket 等数千个）
• 兼容任意带有 dApp 浏览器的手机钱包——在其中打开 bridge 页面即可
• 侧边栏模式——浏览网页时保持配对与状态常驻
• 自动重连——回到 dApp 时自动恢复加密会话，无需重新扫码
• 操作日志——查看签名请求及其状态
• 按来源授权——每个连接的站点单独授权
• 公共或自建中继——默认 wss://relay.walletpair.org/v1，也可指向你自己的中继
• 开源：github.com/atshelchin/remote-inject

权限说明

• storage — 记住中继地址、加密会话状态与已授权来源，下次访问无需重新扫码
• sidePanel — 显示配对二维码与连接状态
• alarms — 保持加密通道存活，并在 Service Worker 休眠后重连
• 主机访问（所有站点）— 向 dApp 页面注入钱包 provider，使其能发起连接请求
```
