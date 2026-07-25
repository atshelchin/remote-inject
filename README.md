# Remote Inject

> Use your phone wallet on any desktop dApp — a registration-free browser bridge built on the open [WalletPair](https://walletpair.org) protocol.

[中文文档](./README.zh.md)

## What is this?

Remote Inject is a Chromium extension that makes any desktop dApp think a wallet is
installed, while the actual signing happens on your phone. It injects an
EIP-1193 / EIP-6963 provider into the page and tunnels every request to your
**mobile wallet** over an end-to-end encrypted channel.

You pair by scanning a QR code, which opens the **Remote Inject bridge page**
inside your mobile wallet's built-in dApp browser. That page is the WalletPair
_wallet_ side — it wraps your wallet's own `window.ethereum` and signs there — so
Remote Inject works with **any mobile wallet that has a dApp browser** (MetaMask,
OKX, TokenPocket, imToken, Trust…), not just WalletPair-native ones.

The transport is the open, end-to-end encrypted **WalletPair protocol** over a
public WebSocket relay. There is no server to run and no account to create.

```
┌─────────────────┐   EIP-1193    ┌─────────────────┐    WalletPair     ┌─────────────────┐
│  Desktop dApp   │◄─────────────►│  Remote Inject  │◄─── encrypted ───►│  Mobile Wallet  │
│   (any site)    │  window.eth   │   (extension)   │   WebSocket relay │  (WalletPair)   │
│                 │               │  background SW  │  relay.walletpair │  your keys      │
└─────────────────┘               └─────────────────┘       .org        └─────────────────┘
```

- The extension holds **no key material** — it only forwards encrypted EIP-1193 messages.
- The relay sees connection metadata (the dApp's name/URL/icon, both peers' public keys, and each frame's chain ID) but **never your plaintext messages or keys** — payloads are sealed with ChaCha20-Poly1305.
- A four-digit pairing code, compared on both devices, authenticates the extension (the dApp side) to your wallet.

## Why?

| WalletConnect | Remote Inject |
| --- | --- |
| Requires a project ID / registration | No registration, no API keys |
| Pairs a project ID to a hosted relay service | Any stateless WalletPair relay; public or self-hosted |
| Multi-layer session protocol | One WebSocket + one AEAD frame format |
| Wallet must implement WalletConnect | Any mobile wallet with a dApp browser (via the bridge page) |

## Install

Remote Inject is a Chromium (MV3) extension. A Chrome Web Store listing is on the
way; until then, load it unpacked:

1. Download the latest `.zip` from [GitHub Releases](https://github.com/atshelchin/remote-inject/releases) and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped `chrome-mv3` folder.

Then open any dApp, click connect, choose **Remote Inject**, scan the QR code with
a WalletPair mobile wallet, and confirm the four-digit code matches.

Full guide: [remoteinject.org/install](https://remoteinject.org/install).

## The WalletPair protocol

Remote Inject implements the WalletPair protocol unchanged. The normative
specifications are maintained at [walletpair.org](https://walletpair.org):

| Layer | What it defines | Spec |
| --- | --- | --- |
| Encryption | QR pairing, X25519 + HKDF key schedule, the four-digit code, ChaCha20-Poly1305 framing | [core-concepts](https://walletpair.org/docs/core-concepts) |
| Relay | The stateless `/v1` WebSocket, `channel_joined`, opaque frame routing | [relay](https://walletpair.org/docs/relay) |
| Ethereum | The EIP-1193 provider surface, supported methods, events, errors | [evm-methods](https://walletpair.org/docs/evm-methods) |

The default relay is `wss://relay.walletpair.org/v1`. You can point the extension
at any WalletPair relay from its Settings panel, or
[self-host one](https://walletpair.org/docs/relay).

## Project structure

```
remote-inject/
├── packages/
│   ├── chrome-extension/     # The Remote Inject browser extension (WXT + Svelte, MV3)
│   │   └── src/
│   │       ├── lib/walletpair/   # WalletPair protocol core (crypto, relay, session, msgpack)
│   │       ├── lib/protocols/    # EIP-1193 / Ethereum protocol handler
│   │       ├── entrypoints/      # background SW, content bridge, MAIN-world provider, popup, sidepanel, confirm
│   │       └── components/       # Svelte UI
│   │
│   └── remoteinject.org/     # Marketing + docs site (SvelteKit on Cloudflare Workers)
│
├── docs/                     # Chrome Web Store listing, submission notes, privacy policy
└── README.md
```

There is **no server package** — the protocol runs over the hosted WalletPair
relay. There is **no SDK package** — dApps talk to the extension through the
standard EIP-1193 / EIP-6963 provider, and wallet integrators implement the
WalletPair protocol directly (see [walletpair.org](https://walletpair.org)).

## Development

```bash
# Install (Bun workspace)
bun install

# Chrome extension — dev, build, test
cd packages/chrome-extension
bun run dev            # WXT dev server
bun run build          # production build → .output/chrome-mv3
bun run zip            # packaged .zip for release
bun run test           # protocol + provider unit tests (Vitest)
bun run check          # svelte-check

# Website — dev, build
cd packages/remoteinject.org
bun run dev
bun run build
```

## Supported wallets

Any mobile wallet with a built-in dApp browser (MetaMask, OKX, TokenPocket,
imToken, Trust, …) — you open the bridge page inside it. WalletPair-native
wallets can also scan the raw pairing URI directly. The extension is the **dApp
side** of a pairing; your phone runs the **wallet side** (via the bridge page).

## License

MIT — let wallet connections stay open and free.
