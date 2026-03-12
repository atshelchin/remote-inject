# Remote Inject

> An open-source, self-hosted, registration-free WalletConnect alternative.

[中文文档](./README.zh.md)

## What is this?

Remote Inject enables DApps to sign transactions using mobile wallets without relying on any centralized service.

The principle is simple: open a bridge page in the mobile wallet's WebView, which "remotely injects" the wallet's `window.ethereum` capability to DApps on other devices.

```
┌─────────────────┐       SSE+HTTP      ┌─────────────────┐       SSE+HTTP      ┌─────────────────┐
│ Desktop Browser │                     │  Remote Inject  │                     │  Mobile Wallet  │
│   (Your DApp)   │◄───────────────────►│     Server      │◄───────────────────►│   (WebView)     │
│                 │                     │                 │                     │                 │
│  SDK provides   │                     │  Bun + Elysia   │                     │     Real        │
│ virtual ethereum│                     │  Message relay  │                     │ window.ethereum │
└─────────────────┘                     └─────────────────┘                     └─────────────────┘
```

## Why do you need it?

### Problems with WalletConnect

| Problem | Description |
|---------|-------------|
| Centralized | v2 forces use of official Relay server, cannot self-host |
| Registration required | Must apply for projectId to use |
| Future charges | WCT token issued, plans to charge for Relay service |
| Complex protocol | Multi-layer encryption, session management, high implementation cost |

### Advantages of Remote Inject

| Advantage | Description |
|-----------|-------------|
| Fully self-hosted | Deploy on your own server, data doesn't pass through third parties |
| No registration | No need to apply for any ID or key |
| Forever free | Open source project, no commercial charging plans |
| Minimal implementation | One Bun service + a few HTML pages |
| Wallet agnostic | Supports any wallet with a DApp browser |

## Quick Start

### Install dependencies

```bash
bun install
```

### Start development server

```bash
cd packages/server
bun run dev
```

Server runs on `http://localhost:3700` by default.

### Test connection

1. Open `http://localhost:3700/demo` in desktop browser
2. Click **Create Connection** to generate QR code
3. Scan the QR code with mobile wallet (MetaMask, TokenPocket, imToken, etc.)
4. Bridge page opens automatically in wallet, connection established
5. Test on desktop: get accounts, sign messages, send transactions

## How It Works

### Connection Flow

```
1. DApp creates Session
   └── Gets short link: https://your-bridge.com/s/A7X3

2. User opens link on mobile
   ├── Method A: Scan with wallet → Opens directly in WebView
   ├── Method B: Scan with camera → Landing page guide → Jump to wallet
   └── Method C: Manually copy link to wallet browser

3. Bridge page connects to Relay, pairs with DApp

4. DApp receives connection event (address, chain ID)

5. Transaction signing
   DApp calls → Relay forwards → Mobile confirms → Result returns
```

### Message Flow

```
  DApp                      Relay                     Mobile
   │                          │                          │
   │── GET /sse?role=dapp ───►│                          │
   │◄── ready ────────────────│                          │
   │                          │◄── GET /sse?role=mobile ─│
   │                          │─── ready ───────────────►│
   │                          │                          │
   │                          │◄─ POST connect(addr,chain)│
   │                          │  (server caches walletInfo)
   │◄── SSE connect ──────────│                          │
   │                          │                          │
   │── POST eth_sendTransaction►│                         │
   │                          │── SSE eth_sendTransaction►│
   │                          │                          │
   │                          │       [User confirms]    │
   │                          │                          │
   │                          │◄──── POST result ────────│
   │◄──── SSE result ─────────│                          │
```

## Tech Stack

| Component | Technology | Description |
|-----------|------------|-------------|
| Runtime | Bun | Fast, native TypeScript support |
| Web Framework | Elysia | Lightweight, type-safe, native SSE |
| Build Tool | Turborepo | Monorepo build orchestration |
| Landing Page | Pure HTML | No framework, post-scan guide page |
| Bridge Page | Pure HTML | No framework, runs in wallet WebView |
| SDK | TypeScript | EIP-1193 Provider |
| Chrome Extension | WXT + Svelte | MV3, injects provider into any page |

## Chrome Extension

For DApps that haven't integrated the SDK, you can use the **Remote Inject Bridge** Chrome extension to inject an EIP-1193/EIP-6963 provider into any web page.

### Install

1. Download the latest release from [GitHub Releases](https://github.com/atshelchin/remote-inject/releases)
2. Extract the zip file
3. Open Chrome → `chrome://extensions/`
4. Enable **Developer mode** (top right)
5. Click **Load unpacked** → select the extracted folder

### Usage

1. Click the extension icon → enter your Remote Inject server URL → Connect
2. Scan the QR code with your mobile wallet
3. Open any DApp — the extension automatically provides a wallet connection

The extension works with any EIP-6963 compatible DApp (Uniswap, Aave, etc.) and also sets `window.ethereum` for legacy DApps.

## Project Structure

```
remote-inject/
├── packages/
│   ├── server/                 # Relay service
│   │   ├── src/
│   │   │   ├── index.ts        # Entry, Elysia app + SSE/HTTP
│   │   │   ├── session.ts      # Session management
│   │   │   ├── template.ts     # Template rendering + i18n
│   │   │   └── config.ts       # External config loader
│   │   ├── templates/          # Eta templates
│   │   ├── public/             # Static assets
│   │   ├── config-example/     # Example config files
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── sdk/                    # DApp SDK
│   │   ├── src/
│   │   │   ├── provider.ts     # EIP-1193 Provider
│   │   │   └── index.ts        # Export entry
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── chrome-extension/       # Chrome Extension (MV3)
│       ├── entrypoints/
│       │   ├── background.ts   # Service Worker
│       │   ├── content.ts      # Content Script bridge
│       │   ├── injected.ts     # EIP-1193/6963 provider
│       │   ├── offscreen/      # SSE + HTTP host (SDK)
│       │   └── popup/          # Extension popup UI (Svelte)
│       ├── wxt.config.ts
│       └── package.json
│
├── package.json                # Monorepo root config
├── turbo.json                  # Turborepo config
├── protocol.md                 # Protocol design document
└── README.md
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session` | POST | Create new Session, returns `{ id, secret, url, expiresAt }` |
| `/session/:id` | GET | Get session info and status |
| `/s/:id` | GET | Short link, redirects to landing page |
| `/sse` | GET | SSE connection (server→client push), params `session`, `role`, `k` |
| `/message` | POST | Send message (client→server), params `session`, `role`, `k` |
| `/health` | GET | Health check endpoint |
| `/metrics` | GET | Server metrics and statistics |
| `/demo` | GET | Demo page |
| `/landing` | GET | Landing page |
| `/bridge` | GET | Bridge page |

## SDK Usage

### Basic Usage

```typescript
import { RemoteProvider } from '@shelchin/remote-inject-sdk'

const provider = new RemoteProvider()

// Connect to server, get Session
const { sessionId, url } = await provider.connect('https://your-server.com', {
  name: 'My DApp',
  url: window.location.origin,
  icon: 'https://example.com/icon.png'
})

// Display QR code for user to scan
showQRCode(url)

// Listen for connection event
provider.on('connect', ({ chainId }) => {
  console.log('Connected, chain ID:', chainId)
  console.log('Account:', provider.accounts)
})

// Send transaction
const txHash = await provider.request({
  method: 'eth_sendTransaction',
  params: [{
    from: provider.accounts[0],
    to: '0x...',
    value: '0x...',
  }]
})
```

### Event Listening

```typescript
provider.on('connect', ({ chainId }) => { /* ... */ })
provider.on('disconnect', ({ code, message }) => { /* ... */ })
provider.on('chainChanged', (chainId) => { /* ... */ })
provider.on('accountsChanged', (accounts) => { /* ... */ })
```

## Customization

Remote Inject supports external configuration for i18n translations and themes, allowing you to customize without modifying source code.

### Configuration Directory

Set the `CONFIG_DIR` environment variable to point to your config directory:

```bash
CONFIG_DIR=/opt/remote-inject/config ./remote-inject
```

### Custom Translations (i18n)

Create JSON files in `{CONFIG_DIR}/i18n/` directory:

```
config/
└── i18n/
    ├── zh.json    # Override Chinese translations
    ├── ja.json    # Add Japanese language
    └── ko.json    # Add Korean language
```

Example `ja.json`:
```json
{
  "app.name": "Remote Inject",
  "common.loading": "読み込み中...",
  "landing.title": "ウォレット接続"
}
```

**How it works:**
- External translations **merge with and override** built-in translations
- You can override specific keys or add entirely new languages
- Built-in languages: `en`, `zh`

### Custom Theme

Create `{CONFIG_DIR}/themes/custom.css`:

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

See [config-example/themes/custom.css](./packages/server/config-example/themes/custom.css) for all available CSS variables.

## Deployment

### GitHub Actions Secrets

Configure these secrets in your GitHub repository for automated deployment:

| Secret | Description |
|--------|-------------|
| `NPM_TOKEN` | npm access token for publishing SDK |
| `SSH_HOST` | Deployment server hostname |
| `SSH_USER` | SSH username |
| `SSH_KEY` | SSH private key |
| `ENV_FILE` | Contents of `.env` file for production |

### Environment Variables

```bash
# Server Configuration
PORT=3700
HOST=0.0.0.0

# Capacity Limits
MAX_SESSIONS=10000

# Session TTL (seconds, optional — defaults shown)
SESSION_CREDENTIAL_TTL=31536000   # 1 year  — session ID stays valid, no re-scan
SESSION_PENDING_TTL=300           # 5 min   — waiting for first connection
SESSION_CONNECTED_TTL=604800      # 7 days  — both sides connected
SESSION_IDLE_TTL=3600             # 1 hour  — both disconnected, clears walletInfo

# External Config Directory (optional)
CONFIG_DIR=/opt/remote-inject/config
```

### Manual Deployment

```bash
# Build single executable with embedded assets
cd packages/server
bun run build:exe

# Copy executable to server
scp dist/remote-inject user@server:/opt/remote-inject/

# Run with environment variables
PORT=3700 ./remote-inject
```

## Documentation

- [Protocol Design](./protocol.md) - Detailed message protocol specification

## Supported Wallets

Theoretically supports any wallet with a DApp browser, including but not limited to:

- MetaMask Mobile
- TokenPocket
- imToken
- Trust Wallet
- Coinbase Wallet
- OKX Wallet

## License

MIT

---

**Let wallet connections return to openness and freedom.**
