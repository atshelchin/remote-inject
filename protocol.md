# Protocol Design

Remote Inject uses a minimal JSON message protocol to relay messages between DApp and Mobile via WebSocket.

[中文文档](./protocol.zh.md)

## Overview

```
┌─────────┐              ┌─────────┐              ┌─────────┐
│  DApp   │◄────WS──────►│  Relay  │◄─────WS─────►│ Mobile  │
│  SDK    │    JSON      │ Server  │    JSON      │ Bridge  │
└─────────┘              └─────────┘              └─────────┘
```

- **Transport Layer**: WebSocket (WS/WSS)
- **Message Format**: JSON
- **Roles**: DApp and Mobile, transparently forwarded through Relay

## Session

### Concept

A Session is a connection session created by DApp and joined by Mobile. Each Session has a unique short ID.

### Create Session

```http
POST /session
Content-Type: application/json
```

**Response:**

```json
{
  "id": "A7X3",
  "url": "https://your-server.com/s/A7X3",
  "expiresAt": 1234567890000
}
```

### Data Structure

```typescript
interface Session {
  id: string              // Short code, e.g., "A7X3"
  createdAt: number       // Creation time (Unix ms)
  expiresAt: number       // Expiration time (Unix ms)
  status: SessionStatus
  dapp: WebSocket | null  // DApp connection
  mobile: WebSocket | null // Mobile connection
}

type SessionStatus =
  | 'pending'      // Created, waiting for both parties to connect
  | 'connected'    // Both parties connected
  | 'disconnected' // Disconnected
```

### Lifecycle

```
        Create Session
             │
             ▼
         ┌───────┐
         │pending│──────────────────────┐
         └───┬───┘                      │
             │                          │
     DApp and Mobile                 Timeout
      both connected                (5 minutes)
             │                          │
             ▼                          ▼
       ┌───────────┐              ┌──────────┐
       │ connected │              │Auto delete│
       └─────┬─────┘              └──────────┘
             │
       Either party
       disconnects or
       timeout (24h)
             │
             ▼
      ┌──────────────┐
      │ disconnected │
      └──────────────┘
             │
             ▼
        ┌──────────┐
        │Auto delete│
        └──────────┘
```

### Session ID Rules

- Length: 4 characters
- Character set: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excluding 0/O/1/I/L)
- Generation: Cryptographically random (`crypto.getRandomValues`)
- Examples: `A7X3`, `K9M2`, `HPQW`

Design considerations:
- 4 digits short enough for manual input
- ~700,000 combinations, sufficient for short-term Sessions
- Excludes easily confused characters to reduce user input errors

## WebSocket Connection

### Endpoint

```
ws://{host}/ws?session={sessionId}&role={role}
```

**Parameters:**

| Parameter | Description | Value |
|-----------|-------------|-------|
| `session` | Session ID | e.g., `A7X3` |
| `role` | Connection role | `dapp` or `mobile` |

### Connection Flow

```
Client                                    Server
   │                                         │
   │──────── WebSocket handshake ───────────►│
   │                                         │
   │                              Verify Session exists
   │                              Verify role is valid
   │                              Register connection
   │                                         │
   │◄─────── { type: "ready" } ──────────────│
   │                                         │
   │            Can start sending messages   │
```

### Error Responses

Connection may return the following HTTP errors:

| Status Code | Description |
|-------------|-------------|
| 400 | Missing session or role parameter |
| 400 | Invalid role value (must be dapp or mobile) |
| 404 | Session does not exist |

## Message Format

All messages are JSON objects and must include a `type` field.

### Message Types Overview

| type | Direction | Description |
|------|-----------|-------------|
| `ready` | Server → Client | Connection ready |
| `connect` | Mobile → DApp | Wallet connected |
| `disconnect` | Bidirectional | Disconnect |
| `request` | DApp → Mobile | RPC request |
| `response` | Mobile → DApp | RPC response |
| `chainChanged` | Mobile → DApp | Chain change event |
| `accountsChanged` | Mobile → DApp | Account change event |
| `error` | Server → Client | Error notification |

---

## Message Detailed Definitions

### ready

Connection ready notification, sent by Server after successful WebSocket handshake.

```typescript
interface ReadyMessage {
  type: 'ready'
}
```

Example:
```json
{ "type": "ready" }
```

---

### connect

Wallet connection notification, sent by Mobile to DApp after receiving `ready`.

```typescript
interface ConnectMessage {
  type: 'connect'
  address: string     // Wallet address, e.g., "0x1234...abcd"
  chainId: number     // Chain ID, e.g., 1 (Ethereum Mainnet)
}
```

Example:
```json
{
  "type": "connect",
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f3a3a9",
  "chainId": 1
}
```

---

### disconnect

Disconnect notification, can be sent by either party.

```typescript
interface DisconnectMessage {
  type: 'disconnect'
  reason?: string     // Optional, disconnect reason
}
```

Example:
```json
{ "type": "disconnect", "reason": "User initiated" }
```

Common disconnect reasons:
- `User initiated` - User actively disconnected
- `Session expired` - Session expired
- `Wallet disconnected` - Wallet disconnected
- `Peer disconnected` - Remote party disconnected

---

### request

RPC request, sent by DApp to Mobile.

```typescript
interface RequestMessage {
  type: 'request'
  id: number          // Request ID, used for matching response
  method: string      // RPC method name
  params?: unknown[]  // Parameter array
}
```

Example:
```json
{
  "type": "request",
  "id": 1,
  "method": "eth_sendTransaction",
  "params": [{
    "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f3a3a9",
    "to": "0x1234567890123456789012345678901234567890",
    "value": "0x16345785d8a0000",
    "data": "0x"
  }]
}
```

**Request ID rules:**
- Must be a positive integer
- Increments within a single Session
- Used to match response with request

---

### response

RPC response, sent by Mobile to DApp.

```typescript
interface ResponseMessage {
  type: 'response'
  id: number                // Corresponds to request id
  result?: unknown          // Success result
  error?: {
    code: number            // Error code
    message: string         // Error message
  }
}
```

Success example:
```json
{
  "type": "response",
  "id": 1,
  "result": "0x1234567890abcdef..."
}
```

Failure example:
```json
{
  "type": "response",
  "id": 1,
  "error": {
    "code": 4001,
    "message": "User rejected the request"
  }
}
```

**Response rules:**
- Either `result` or `error`, not both
- `id` must match the corresponding request's `id`
- Must respond within timeout (default 60 seconds)

---

### chainChanged

Chain change event, Mobile notifies DApp when user switches chain.

```typescript
interface ChainChangedMessage {
  type: 'chainChanged'
  chainId: number     // New chain ID
}
```

Example:
```json
{ "type": "chainChanged", "chainId": 137 }
```

---

### accountsChanged

Account change event, Mobile notifies DApp when user switches account.

```typescript
interface AccountsChangedMessage {
  type: 'accountsChanged'
  accounts: string[]  // New account list
}
```

Example:
```json
{
  "type": "accountsChanged",
  "accounts": ["0x9876...5432"]
}
```

If `accounts` is an empty array, it means the user disconnected the wallet.

---

### error

Server error notification, sent when peer is not connected.

```typescript
interface ErrorMessage {
  type: 'error'
  code: number
  message: string
}
```

Example:
```json
{
  "type": "error",
  "code": -32000,
  "message": "Peer not connected"
}
```

---

## Supported RPC Methods

### Locally Handled Methods

These methods are handled locally by SDK, not forwarded to Mobile:

| Method | Description | Return Value |
|--------|-------------|--------------|
| `eth_accounts` | Get connected accounts | `string[]` |
| `eth_chainId` | Get current chain ID | `string` (hex) |
| `eth_requestAccounts` | Request accounts (waits for Mobile connection) | `string[]` |

### Methods Forwarded to Mobile

All other methods are forwarded to Mobile for execution, including:

| Method | Description |
|--------|-------------|
| `personal_sign` | Sign message |
| `eth_signTypedData_v4` | Sign typed data (EIP-712) |
| `eth_sendTransaction` | Send transaction |
| `eth_getBalance` | Get balance |
| `eth_blockNumber` | Get block number |
| `wallet_switchEthereumChain` | Switch chain |
| `wallet_addEthereumChain` | Add chain |
| `wallet_watchAsset` | Add token |

---

## Error Codes

Follows EIP-1193 and EIP-1474 specifications.

### Standard Error Codes

| Code | Name | Description |
|------|------|-------------|
| 4001 | User Rejected | User rejected request |
| 4100 | Unauthorized | Requested method/account not authorized |
| 4200 | Unsupported Method | Method not supported |
| 4900 | Disconnected | Provider disconnected from chain |
| 4901 | Chain Disconnected | Requested chain disconnected |

### JSON-RPC Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32700 | Parse Error | JSON parsing failed |
| -32600 | Invalid Request | Invalid request object |
| -32601 | Method Not Found | Method does not exist |
| -32602 | Invalid Params | Invalid method parameters |
| -32603 | Internal Error | Internal error |

### Remote Inject Custom Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32000 | Peer Not Connected | Other party not connected |
| -32001 | Session Not Found | Session does not exist |
| -32002 | Session Expired | Session has expired |
| -32003 | Request Timeout | Request timeout (60 seconds) |

---

## Complete Interaction Examples

### Scenario: Send Transaction

```
Timeline          DApp                 Relay                Mobile
  │
  │  ─────────── POST /session ───────►
  │  ◄──────────  { id: "A7X3" } ──────
  │
  │  Display QR code: https://xxx/s/A7X3
  │
  │                                                   User scans
  │                                                      │
  │  ────────── WS connect ─────────────────►           │
  │  ◄──────── ready ────────────────────────           │
  │                                       ◄─── WS connect──┤
  │                                       ──── ready ────►│
  │                                                      │
  │                                       ◄── connect ───│
  │  ◄──────── connect ──────────────────                │
  │            {address, chainId}                        │
  │                                                      │
  │  Close QR code                                       │
  │  Display "Connected"                                 │
  │                                                      │
  │  ─── request ────────────────────────►               │
  │      {id:1, method:"eth_sendTransaction"}            │
  │                                       ─── request ──►│
  │                                                      │
  │                                            Show confirm dialog
  │                                            User clicks confirm
  │                                                      │
  │                                       ◄── response ──│
  │  ◄─── response ──────────────────────                │
  │       {id:1, result:"0xTxHash..."}                   │
  │                                                      │
  │  Display transaction success                         │
```

### Scenario: User Rejection

```
  DApp                    Relay                   Mobile
   │                        │                        │
   │── request ────────────►│                        │
   │   {id:2, method:"personal_sign"}                │
   │                        │─── request ───────────►│
   │                        │                        │
   │                        │               Show sign dialog
   │                        │               User clicks reject
   │                        │                        │
   │                        │◄── response ───────────│
   │◄─── response ──────────│    {id:2, error:4001}  │
   │     {id:2, error:{code:4001}}                   │
   │                        │                        │
   │  Catch UserRejected error                       │
```

### Scenario: Switch Chain

```
  DApp                    Relay                   Mobile
   │                        │                        │
   │                        │               User switches chain in wallet
   │                        │                        │
   │                        │◄── chainChanged ───────│
   │◄── chainChanged ───────│    {chainId: 137}      │
   │    {chainId: 137}      │                        │
   │                        │                        │
   │  Update UI to show current chain                │
```

---

## Security Considerations

### Transport Security

- **Production must use WSS**: All WebSocket connections should be TLS encrypted
- Relay server should have valid SSL certificate

### Session Security

- **Short validity**: pending Session expires in 5 minutes, connected Session expires in 24 hours
- **Random ID**: Uses cryptographically secure random number generation
- **Single use**: Each role can only have one connection

### Message Security

- **Request ID**: Prevents response mismatch
- **Timeout mechanism**: 60 second timeout prevents hanging requests
- **Origin verification**: Bridge page should display DApp origin, user must verify

### Security Outside Protocol Scope

The following security issues require user attention:

- Phishing attacks (users must verify DApp origin themselves)
- Malicious DApps (protocol cannot prevent DApp from sending malicious transactions)
- Endpoint security (wallet private key protection is outside this protocol's scope)

---

## Version Control

Current protocol version: `1.0`

For future version upgrades, version parameter can be added to WebSocket URL:

```
wss://xxx/ws?session=A7X3&role=dapp&v=2
```

Relay server should handle lower version clients with backward compatibility.
