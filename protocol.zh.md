# 协议设计

Remote Inject 使用极简的 JSON 消息协议，通过 WebSocket 在 DApp 和 Mobile 之间中继消息。

[English](./protocol.md)

## 概述

```
┌─────────┐              ┌─────────┐              ┌─────────┐
│  DApp   │◄────WS──────►│  Relay  │◄─────WS─────►│ Mobile  │
│  SDK    │    JSON      │ Server  │    JSON      │ Bridge  │
└─────────┘              └─────────┘              └─────────┘
```

- **传输层**: WebSocket (WS/WSS)
- **消息格式**: JSON
- **角色**: DApp 和 Mobile，通过 Relay 透明转发

## Session

### 概念

Session 是一次连接会话，由 DApp 创建，Mobile 加入。每个 Session 有唯一的短 ID。

### 创建 Session

```http
POST /session
Content-Type: application/json
```

**响应：**

```json
{
  "id": "A7X3",
  "url": "https://your-server.com/s/A7X3",
  "expiresAt": 1234567890000
}
```

### 数据结构

```typescript
interface Session {
  id: string              // 短码，如 "A7X3"
  createdAt: number       // 创建时间 (Unix ms)
  expiresAt: number       // 过期时间 (Unix ms)
  status: SessionStatus
  dapp: WebSocket | null  // DApp 连接
  mobile: WebSocket | null // Mobile 连接
}

type SessionStatus =
  | 'pending'      // 已创建，等待双方连接
  | 'connected'    // 双方已连接
  | 'disconnected' // 已断开
```

### 生命周期

```
        创建 Session
             │
             ▼
         ┌───────┐
         │pending│──────────────────────┐
         └───┬───┘                      │
             │                          │
     DApp 和 Mobile                   超时
       都已连接                      (5分钟)
             │                          │
             ▼                          ▼
       ┌───────────┐              ┌──────────┐
       │ connected │              │ 自动删除  │
       └─────┬─────┘              └──────────┘
             │
       任一方断开
       或超时(24h)
             │
             ▼
      ┌──────────────┐
      │ disconnected │
      └──────────────┘
             │
             ▼
        ┌──────────┐
        │ 自动删除  │
        └──────────┘
```

### Session ID 规则

- 长度：4 个字符
- 字符集：`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (排除 0/O/1/I/L)
- 生成：密码学随机 (`crypto.getRandomValues`)
- 示例：`A7X3`, `K9M2`, `HPQW`

设计考虑：
- 4 位足够短，方便手动输入
- 约 70 万种组合，对于短期 Session 足够
- 排除易混淆字符，减少用户输入错误

## WebSocket 连接

### 端点

```
ws://{host}/ws?session={sessionId}&role={role}
```

**参数：**

| 参数 | 说明 | 值 |
|------|------|-----|
| `session` | Session ID | 如 `A7X3` |
| `role` | 连接角色 | `dapp` 或 `mobile` |

### 连接流程

```
Client                                    Server
   │                                         │
   │──────── WebSocket 握手 ─────────────────►│
   │                                         │
   │                              验证 Session 存在
   │                              验证 role 有效
   │                              注册连接
   │                                         │
   │◄─────── { type: "ready" } ──────────────│
   │                                         │
   │            可以开始发送消息              │
```

### 错误响应

连接时可能返回以下 HTTP 错误：

| 状态码 | 说明 |
|--------|------|
| 400 | 缺少 session 或 role 参数 |
| 400 | role 值无效（必须是 dapp 或 mobile） |
| 404 | Session 不存在 |

## 消息格式

所有消息都是 JSON 对象，必须包含 `type` 字段。

### 消息类型总览

| type | 方向 | 说明 |
|------|------|------|
| `ready` | Server → Client | 连接就绪 |
| `connect` | Mobile → DApp | 钱包已连接 |
| `disconnect` | 双向 | 断开连接 |
| `request` | DApp → Mobile | RPC 请求 |
| `response` | Mobile → DApp | RPC 响应 |
| `chainChanged` | Mobile → DApp | 链变更事件 |
| `accountsChanged` | Mobile → DApp | 账户变更事件 |
| `error` | Server → Client | 错误通知 |

---

## 消息详细定义

### ready

连接就绪通知，由 Server 在 WebSocket 握手成功后发送。

```typescript
interface ReadyMessage {
  type: 'ready'
}
```

示例：
```json
{ "type": "ready" }
```

---

### connect

钱包连接通知，Mobile 收到 `ready` 后发送给 DApp。

```typescript
interface ConnectMessage {
  type: 'connect'
  address: string     // 钱包地址，如 "0x1234...abcd"
  chainId: number     // 链 ID，如 1 (Ethereum Mainnet)
}
```

示例：
```json
{
  "type": "connect",
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f3a3a9",
  "chainId": 1
}
```

---

### disconnect

断开连接通知，任一方可发送。

```typescript
interface DisconnectMessage {
  type: 'disconnect'
  reason?: string     // 可选，断开原因
}
```

示例：
```json
{ "type": "disconnect", "reason": "User initiated" }
```

断开原因常见值：
- `User initiated` - 用户主动断开
- `Session expired` - Session 过期
- `Wallet disconnected` - 钱包断开连接
- `Peer disconnected` - 对端断开连接

---

### request

RPC 请求，DApp 发送给 Mobile。

```typescript
interface RequestMessage {
  type: 'request'
  id: number          // 请求 ID，用于匹配响应
  method: string      // RPC 方法名
  params?: unknown[]  // 参数数组
}
```

示例：
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

**请求 ID 规则：**
- 必须是正整数
- 在单个 Session 内递增
- 用于将 response 与 request 匹配

---

### response

RPC 响应，Mobile 回复给 DApp。

```typescript
interface ResponseMessage {
  type: 'response'
  id: number                // 对应 request 的 id
  result?: unknown          // 成功结果
  error?: {
    code: number            // 错误码
    message: string         // 错误信息
  }
}
```

成功示例：
```json
{
  "type": "response",
  "id": 1,
  "result": "0x1234567890abcdef..."
}
```

失败示例：
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

**响应规则：**
- `result` 和 `error` 二选一
- `id` 必须与对应 request 的 `id` 匹配
- 必须在超时时间内响应（默认 60 秒）

---

### chainChanged

链变更事件，Mobile 在用户切换链时通知 DApp。

```typescript
interface ChainChangedMessage {
  type: 'chainChanged'
  chainId: number     // 新的链 ID
}
```

示例：
```json
{ "type": "chainChanged", "chainId": 137 }
```

---

### accountsChanged

账户变更事件，Mobile 在用户切换账户时通知 DApp。

```typescript
interface AccountsChangedMessage {
  type: 'accountsChanged'
  accounts: string[]  // 新的账户列表
}
```

示例：
```json
{
  "type": "accountsChanged",
  "accounts": ["0x9876...5432"]
}
```

如果 `accounts` 为空数组，表示用户断开了钱包连接。

---

### error

服务端错误通知，当对端未连接时发送。

```typescript
interface ErrorMessage {
  type: 'error'
  code: number
  message: string
}
```

示例：
```json
{
  "type": "error",
  "code": -32000,
  "message": "Peer not connected"
}
```

---

## 支持的 RPC 方法

### 本地处理的方法

这些方法由 SDK 在本地处理，不转发到 Mobile：

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `eth_accounts` | 获取已连接账户 | `string[]` |
| `eth_chainId` | 获取当前链 ID | `string` (hex) |
| `eth_requestAccounts` | 请求账户（等待 Mobile 连接） | `string[]` |

### 转发到 Mobile 的方法

所有其他方法都会转发到 Mobile 执行，包括：

| 方法 | 说明 |
|------|------|
| `personal_sign` | 签名消息 |
| `eth_signTypedData_v4` | 签名类型化数据 (EIP-712) |
| `eth_sendTransaction` | 发送交易 |
| `eth_getBalance` | 获取余额 |
| `eth_blockNumber` | 获取区块高度 |
| `wallet_switchEthereumChain` | 切换链 |
| `wallet_addEthereumChain` | 添加链 |
| `wallet_watchAsset` | 添加代币 |

---

## 错误码

遵循 EIP-1193 和 EIP-1474 规范。

### 标准错误码

| 码 | 名称 | 说明 |
|----|------|------|
| 4001 | User Rejected | 用户拒绝请求 |
| 4100 | Unauthorized | 请求的方法/账户未授权 |
| 4200 | Unsupported Method | 不支持的方法 |
| 4900 | Disconnected | 提供者与链断开 |
| 4901 | Chain Disconnected | 请求的链断开 |

### JSON-RPC 错误码

| 码 | 名称 | 说明 |
|----|------|------|
| -32700 | Parse Error | JSON 解析失败 |
| -32600 | Invalid Request | 无效的请求对象 |
| -32601 | Method Not Found | 方法不存在 |
| -32602 | Invalid Params | 无效的方法参数 |
| -32603 | Internal Error | 内部错误 |

### Remote Inject 自定义错误码

| 码 | 名称 | 说明 |
|----|------|------|
| -32000 | Peer Not Connected | 对方未连接 |
| -32001 | Session Not Found | Session 不存在 |
| -32002 | Session Expired | Session 已过期 |
| -32003 | Request Timeout | 请求超时（60秒） |

---

## 完整交互示例

### 场景：发送交易

```
时间轴            DApp                 Relay                Mobile
  │
  │  ─────────── POST /session ───────►
  │  ◄──────────  { id: "A7X3" } ──────
  │
  │  显示二维码: https://xxx/s/A7X3
  │
  │                                                   用户扫码
  │                                                      │
  │  ────────── WS 连接 ─────────────────►               │
  │  ◄──────── ready ────────────────────                │
  │                                       ◄─── WS 连接 ──┤
  │                                       ──── ready ───►│
  │                                                      │
  │                                       ◄── connect ───│
  │  ◄──────── connect ──────────────────                │
  │            {address, chainId}                        │
  │                                                      │
  │  关闭二维码                                           │
  │  显示"已连接"                                         │
  │                                                      │
  │  ─── request ────────────────────────►               │
  │      {id:1, method:"eth_sendTransaction"}            │
  │                                       ─── request ──►│
  │                                                      │
  │                                            显示确认弹窗
  │                                            用户点击确认
  │                                                      │
  │                                       ◄── response ──│
  │  ◄─── response ──────────────────────                │
  │       {id:1, result:"0xTxHash..."}                   │
  │                                                      │
  │  显示交易成功                                         │
```

### 场景：用户拒绝

```
  DApp                    Relay                   Mobile
   │                        │                        │
   │── request ────────────►│                        │
   │   {id:2, method:"personal_sign"}                │
   │                        │─── request ───────────►│
   │                        │                        │
   │                        │               显示签名弹窗
   │                        │               用户点击拒绝
   │                        │                        │
   │                        │◄── response ───────────│
   │◄─── response ──────────│    {id:2, error:4001}  │
   │     {id:2, error:{code:4001}}                   │
   │                        │                        │
   │  捕获 UserRejected 错误                          │
```

### 场景：切换链

```
  DApp                    Relay                   Mobile
   │                        │                        │
   │                        │               用户在钱包切换链
   │                        │                        │
   │                        │◄── chainChanged ───────│
   │◄── chainChanged ───────│    {chainId: 137}      │
   │    {chainId: 137}      │                        │
   │                        │                        │
   │  更新 UI 显示当前链                              │
```

---

## 安全考虑

### 传输安全

- **生产环境必须使用 WSS**：所有 WebSocket 连接应通过 TLS 加密
- Relay 服务器应配置有效的 SSL 证书

### Session 安全

- **短有效期**：pending Session 5 分钟过期，connected Session 24 小时过期
- **随机 ID**：使用密码学安全的随机数生成
- **一次性使用**：每个角色只能有一个连接

### 消息安全

- **请求 ID**：防止响应错配
- **超时机制**：60 秒超时，防止请求悬挂
- **来源验证**：桥接页应显示 DApp 来源，用户需辨别

### 不在协议范围内的安全

以下安全问题需要使用者自行注意：

- 钓鱼攻击（需要用户自行验证 DApp 来源）
- 恶意 DApp（协议无法阻止 DApp 发送恶意交易）
- 端侧安全（钱包私钥保护不在本协议范围）

---

## 版本控制

当前协议版本：`1.0`

未来版本升级时，可在 WebSocket URL 中添加版本参数：

```
wss://xxx/ws?session=A7X3&role=dapp&v=2
```

Relay 服务器应向后兼容处理低版本客户端。
