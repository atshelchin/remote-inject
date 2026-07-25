# Protocol

[中文](./protocol.zh.md)

Remote Inject speaks the **WalletPair protocol** — an open, minimal, end-to-end
encrypted protocol for connecting a dApp to a wallet. Remote Inject implements the
**dApp side**: the browser extension pairs with a WalletPair mobile wallet and
tunnels EIP-1193 requests to it over an encrypted channel.

This document is a short overview. The **normative specifications** are maintained
in the WalletPair project:

- **Website:** [https://walletpair.org/docs](https://walletpair.org/docs)
- **Specs:** [`encryption`](https://walletpair.org/docs/core-concepts) ·
  [`relay`](https://walletpair.org/docs/relay) ·
  [`ethereum`](https://walletpair.org/docs/evm-methods)

Implementations MUST follow the WalletPair specs exactly; the summary below is
non-normative.

## Roles

A WalletPair channel has exactly two cryptographic peers:

- **A — dApp:** creates the channel. Remote Inject is the dApp peer.
- **B — Wallet:** joins the channel. Your mobile wallet is the wallet peer.

## 1. Pairing

The dApp generates a fresh X25519 key pair and a random 32-byte channel ID, then
displays a QR code encoding a pairing URI:

```
walletpair:?ch=<channel-id>&pubkey=<dapp-pubkey>&relay=<relay-url>&name=<name>&url=<url>&icon=<icon>
```

Both sides independently derive a four-digit **pairing code** from a SHA-256
fingerprint of the channel ID and the dApp's metadata + public key. The user
compares the four digits shown by the extension and the wallet. A match authenticates
the dApp to the wallet and pins the dApp's public key.

## 2. Relay

The relay is a **stateless WebSocket router** at `GET /v1`:

```
wss://relay.walletpair.org/v1?ch=<ch>&name=<name>&url=<url>&icon=<icon>&pubkey=<pubkey>
```

It broadcasts a `channel_joined` event to members of a channel and forwards every
frame **unchanged** to the other peer. It never creates channels via a command,
decrypts, or stores messages. The default relay is `wss://relay.walletpair.org/v1`;
any conforming relay works and can be self-hosted.

## 3. Encryption

Each peer computes `X25519(local_secret, remote_public)` and derives, via
HKDF-SHA256 with the channel ID and a transcript hash, two independent directional
traffic keys (`dapp-to-wallet`, `wallet-to-dapp`). Application messages are encoded
as a JSON-only MessagePack profile and sealed with ChaCha20-Poly1305:

```
frame = base64url(uint32_be(sequence) || ciphertext_tag) @ <caip-2-chain-id>
```

The CAIP-2 suffix (e.g. `eip155:1`) is visible to the relay but authenticated as
AEAD additional data. Sequence numbers are strictly increasing per direction and
persisted across reconnects to prevent replay.

## 4. Ethereum messages

Over the encrypted channel, Remote Inject exposes a standard **EIP-1193** provider.
Requests flow dApp → wallet; responses and events flow wallet → dApp. Messages use
the JSON data model (not JSON-RPC 2.0 — there is no `jsonrpc` field):

```jsonc
// request  (dApp → wallet)
{ "id": "req-1", "method": "personal_sign", "params": ["0x…", "0x…"] }
// response (wallet → dApp) — exactly one of result | error
{ "id": "req-1", "result": "0x…" }
// event    (wallet → dApp)
{ "event": "chainChanged", "data": "0x1" }
```

Supported methods, events, and error codes are defined by the
[Ethereum protocol](https://walletpair.org/docs/evm-methods) (account/chain,
permissions, signing/sending, and an allowlisted read-only RPC set).

## Security summary

- A passive relay or observer learns channel metadata, public keys, CAIP-2 chain
  IDs, timing, and ciphertext sizes — but never plaintext or traffic keys.
- The wallet accepts only messages authenticated with the direction key derived
  from the dApp public key pinned by QR pairing.
- The four-digit code is a short human check (1/10,000 per blind attempt), not
  cryptographic-strength authentication.
- Remote Inject's extension holds no key material; all signing happens in the wallet.

See the [WalletPair security model](https://walletpair.org/docs/security) and its
ProVerif formal verification for the full threat model.
