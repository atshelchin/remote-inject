# Remote Inject

> 一个开源的、自托管的、无需注册的 WalletConnect 替代方案。

[English](./README.md)

## 这是什么？

Remote Inject 让 DApp 通过移动钱包签名交易，无需依赖任何中心化服务。

原理很简单：在移动钱包的 WebView 中打开一个桥接页面，将钱包的 `window.ethereum` 能力"远程注入"到其他设备的 DApp 中。

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   电脑浏览器     │         │  Remote Inject  │         │   移动钱包       │
│   (你的 DApp)   │◄──WS───►│     Server      │◄───WS──►│   (WebView)     │
│                 │         │                 │         │                 │
│  SDK 提供虚拟   │         │  Bun + Elysia   │         │  真实的         │
│  ethereum 对象  │         │  消息中继        │         │  window.ethereum│
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

## 为什么需要它？

### WalletConnect 的问题

| 问题 | 说明 |
|------|------|
| 中心化 | v2 强制使用官方 Relay 服务器，无法自建 |
| 需要注册 | 必须申请 projectId 才能使用 |
| 未来收费 | 已发行 WCT 代币，计划对 Relay 服务收费 |
| 协议复杂 | 多层加密、Session 管理，实现成本高 |

### Remote Inject 的优势

| 优势 | 说明 |
|------|------|
| 完全自托管 | 部署在你自己的服务器，数据不经过第三方 |
| 无需注册 | 不需要申请任何 ID 或密钥 |
| 永久免费 | 开源项目，没有商业收费计划 |
| 极简实现 | 一个 Bun 服务 + 几个 HTML 页面 |
| 钱包无关 | 支持任何有 DApp 浏览器的钱包 |

## 快速开始

### 安装依赖

```bash
bun install
```

### 启动开发服务器

```bash
cd packages/server
bun run dev
```

服务默认运行在 `http://localhost:3700`

### 测试连接

1. 电脑浏览器打开 `http://localhost:3700/demo`
2. 点击 **创建连接** 生成二维码
3. 用移动钱包（MetaMask、TokenPocket、imToken 等）扫描二维码
4. 钱包内自动打开桥接页，建立连接
5. 在电脑端测试：获取账户、签名消息、发送交易

## 工作原理

### 连接流程

```
1. DApp 创建 Session
   └── 获得短链接：https://your-bridge.com/s/A7X3

2. 用户在手机上打开链接
   ├── 方式 A：用钱包扫码 → 直接在 WebView 打开
   ├── 方式 B：用相机扫码 → 落地页引导 → 跳转钱包
   └── 方式 C：手动复制链接到钱包浏览器

3. 桥接页连接 Relay，与 DApp 配对

4. DApp 收到连接事件（地址、链 ID）

5. 交易签名
   DApp 调用 → Relay 转发 → 手机确认 → 结果返回
```

### 消息流

```
  DApp                      Relay                     Mobile
   │                          │                          │
   │───── WS 连接 ───────────►│                          │
   │◄──── ready ──────────────│                          │
   │                          │◄────── WS 连接 ──────────│
   │                          │─────── ready ───────────►│
   │                          │                          │
   │                          │◄─ connect(addr,chain) ───│
   │◄──── connect ────────────│                          │
   │                          │                          │
   │── eth_sendTransaction ──►│                          │
   │                          │── eth_sendTransaction ──►│
   │                          │                          │
   │                          │       [用户确认]          │
   │                          │                          │
   │                          │◄─────── result ──────────│
   │◄─────── result ──────────│                          │
```

## 技术栈

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| 运行时 | Bun | 快速、原生支持 TypeScript |
| Web 框架 | Elysia | 轻量、类型安全、原生 WebSocket |
| 构建工具 | Turborepo | Monorepo 构建编排 |
| 落地页 | 纯 HTML | 无框架，扫码后的引导页 |
| 桥接页 | 纯 HTML | 无框架，钱包 WebView 内运行 |
| SDK | TypeScript | EIP-1193 Provider |

## 项目结构

```
remote-inject/
├── packages/
│   ├── server/                 # Relay 服务
│   │   ├── src/
│   │   │   ├── index.ts        # 入口，Elysia 应用 + WebSocket
│   │   │   ├── session.ts      # Session 管理
│   │   │   ├── template.ts     # 模板渲染 + i18n
│   │   │   └── config.ts       # 外部配置加载器
│   │   ├── templates/          # Eta 模板
│   │   ├── public/             # 静态资源
│   │   ├── config-example/     # 示例配置文件
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── sdk/                    # DApp SDK
│       ├── src/
│       │   ├── provider.ts     # EIP-1193 Provider
│       │   └── index.ts        # 导出入口
│       ├── package.json
│       └── tsconfig.json
│
├── package.json                # Monorepo 根配置
├── turbo.json                  # Turborepo 配置
├── protocol.md                 # 协议设计文档
└── README.md
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/session` | POST | 创建新 Session，返回 `{ id, url, expiresAt }` |
| `/session/:id` | GET | 获取会话信息和状态 |
| `/s/:id` | GET | 短链接，重定向到落地页 |
| `/ws` | WS | WebSocket 连接，参数 `session` 和 `role` |
| `/health` | GET | 健康检查端点 |
| `/metrics` | GET | 服务器指标和统计 |
| `/demo` | GET | 演示页面 |
| `/landing` | GET | 落地页 |
| `/bridge` | GET | 桥接页 |

## SDK 使用

### 基础用法

```typescript
import { RemoteProvider } from '@shelchin/remote-inject-sdk'

const provider = new RemoteProvider()

// 连接服务器，获取 Session
const { sessionId, url } = await provider.connect('https://your-server.com', {
  name: 'My DApp',
  url: window.location.origin,
  icon: 'https://example.com/icon.png'
})

// 显示二维码让用户扫描
showQRCode(url)

// 监听连接事件
provider.on('connect', ({ chainId }) => {
  console.log('已连接，链 ID:', chainId)
  console.log('账户:', provider.accounts)
})

// 发送交易
const txHash = await provider.request({
  method: 'eth_sendTransaction',
  params: [{
    from: provider.accounts[0],
    to: '0x...',
    value: '0x...',
  }]
})
```

### 事件监听

```typescript
provider.on('connect', ({ chainId }) => { /* ... */ })
provider.on('disconnect', ({ code, message }) => { /* ... */ })
provider.on('chainChanged', (chainId) => { /* ... */ })
provider.on('accountsChanged', (accounts) => { /* ... */ })
```

## 自定义配置

Remote Inject 支持外部配置 i18n 翻译和主题，允许你在不修改源代码的情况下进行自定义。

### 配置目录

设置 `CONFIG_DIR` 环境变量指向你的配置目录：

```bash
CONFIG_DIR=/opt/remote-inject/config ./remote-inject
```

### 自定义翻译 (i18n)

在 `{CONFIG_DIR}/i18n/` 目录下创建 JSON 文件：

```
config/
└── i18n/
    ├── zh.json    # 覆盖中文翻译
    ├── ja.json    # 添加日语
    └── ko.json    # 添加韩语
```

示例 `ja.json`：
```json
{
  "app.name": "Remote Inject",
  "common.loading": "読み込み中...",
  "landing.title": "ウォレット接続"
}
```

**工作原理：**
- 外部翻译会**合并并覆盖**内置翻译
- 你可以覆盖特定的键，或添加全新的语言
- 内置语言：`en`、`zh`

### 自定义主题

创建 `{CONFIG_DIR}/themes/custom.css`：

```css
:root {
  --color-accent: #6366f1;
  --color-accent-hover: #818cf8;
  --color-accent-active: #4f46e5;
}

[data-theme="dark"] {
  --color-accent: #818cf8;
}
```

查看 [config-example/themes/custom.css](./packages/server/config-example/themes/custom.css) 了解所有可用的 CSS 变量。

## 部署

### GitHub Actions 密钥

在你的 GitHub 仓库中配置以下密钥以实现自动部署：

| 密钥 | 说明 |
|------|------|
| `NPM_TOKEN` | npm 访问令牌，用于发布 SDK |
| `SSH_HOST` | 部署服务器主机名 |
| `SSH_USER` | SSH 用户名 |
| `SSH_KEY` | SSH 私钥 |
| `ENV_FILE` | 生产环境 `.env` 文件内容 |

### 环境变量

```bash
# 服务器配置
PORT=3700
HOST=0.0.0.0

# 容量限制
MAX_SESSIONS=10000

# 外部配置目录（可选）
CONFIG_DIR=/opt/remote-inject/config
```

### 手动部署

```bash
# 构建单一可执行文件（包含嵌入资源）
cd packages/server
bun run build:exe

# 复制可执行文件到服务器
scp dist/remote-inject user@server:/opt/remote-inject/

# 使用环境变量运行
PORT=3700 ./remote-inject
```

## 文档

- [协议设计](./protocol.zh.md) - 消息协议详细规范

## 支持的钱包

理论上支持任何带有 DApp 浏览器的钱包，包括但不限于：

- MetaMask Mobile
- TokenPocket
- imToken
- Trust Wallet
- Coinbase Wallet
- OKX Wallet

## 许可证

MIT

---

**让钱包连接回归开放与自由。**
