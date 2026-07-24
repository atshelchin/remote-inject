# 协议

[English](./protocol.md)

Remote Inject 使用 **WalletPair 协议** —— 一个开放、极简、端到端加密的 dApp 与钱包连接协议。
Remote Inject 实现的是 **dApp 侧**：浏览器扩展与 WalletPair 手机钱包配对，并通过加密通道把
EIP-1193 请求转发给它。

本文仅为概览。**规范文档**维护在 WalletPair 项目中：

- **官网：** <https://walletpair.org/docs>
- **规范：** [`encryption`](https://walletpair.org/docs/core-concepts) ·
  [`relay`](https://walletpair.org/docs/relay) ·
  [`ethereum`](https://walletpair.org/docs/evm-methods)

实现必须严格遵循 WalletPair 规范；下述摘要为非规范性说明。

## 角色

一个 WalletPair 通道恰好有两个加密对端：

- **A —— dApp：** 创建通道。Remote Inject 是 dApp 对端。
- **B —— 钱包：** 加入通道。你的手机钱包是钱包对端。

## 1. 配对

dApp 生成一对全新的 X25519 密钥和一个随机的 32 字节通道 ID，然后展示编码了配对 URI 的二维码：

```
walletpair:?ch=<channel-id>&pubkey=<dapp-pubkey>&relay=<relay-url>&name=<name>&url=<url>&icon=<icon>
```

双方各自从通道 ID 与 dApp 元数据 + 公钥的 SHA-256 指纹派生出一个四位**配对码**。
用户核对扩展与钱包展示的四位数字。一致即完成 dApp 到钱包的认证，并固定（pin）dApp 的公钥。

## 2. 中继

中继是 `GET /v1` 上的**无状态 WebSocket 路由**：

```
wss://relay.walletpair.org/v1?ch=<ch>&name=<name>&url=<url>&icon=<icon>&pubkey=<pubkey>
```

它向通道成员广播 `channel_joined` 事件，并把每一帧**原样**转发给另一对端。
它不通过命令创建通道，不解密，也不存储消息。默认中继为 `wss://relay.walletpair.org/v1`；
任何符合规范的中继都可使用，也可自建。

## 3. 加密

每个对端计算 `X25519(local_secret, remote_public)`，并通过以通道 ID 与转录哈希为参数的
HKDF-SHA256，派生出两个相互独立的方向性流量密钥（`dapp-to-wallet`、`wallet-to-dapp`）。
应用消息以“仅 JSON 的 MessagePack 剖面”编码，并用 ChaCha20-Poly1305 封装：

```
frame = base64url(uint32_be(sequence) || ciphertext_tag) @ <caip-2-chain-id>
```

CAIP-2 后缀（如 `eip155:1`）对中继可见，但作为 AEAD 附加数据被认证。
序列号按方向严格递增，并在重连间持久化，以防重放。

## 4. 以太坊消息

在加密通道之上，Remote Inject 暴露一个标准的 **EIP-1193** provider。
请求从 dApp → 钱包；响应与事件从钱包 → dApp。消息使用 JSON 数据模型
（不是 JSON-RPC 2.0 —— 没有 `jsonrpc` 字段）：

```jsonc
// 请求（dApp → 钱包）
{ "id": "req-1", "method": "personal_sign", "params": ["0x…", "0x…"] }
// 响应（钱包 → dApp）—— result | error 恰有其一
{ "id": "req-1", "result": "0x…" }
// 事件（钱包 → dApp）
{ "event": "chainChanged", "data": "0x1" }
```

支持的方法、事件与错误码由[以太坊协议](https://walletpair.org/docs/evm-methods)定义
（账户/链、权限、签名/发送，以及一组白名单只读 RPC）。

## 安全摘要

- 被动的中继或观察者能获知通道元数据、公钥、CAIP-2 链 ID、时序与密文大小 ——
  但永远得不到明文或流量密钥。
- 钱包只接受用“由二维码配对固定的 dApp 公钥派生出的方向密钥”认证的消息。
- 四位配对码是一个简短的人工校验（每次盲猜命中概率 1/10000），并非密码学强度的认证。
- Remote Inject 扩展不持有任何密钥材料；所有签名都发生在钱包中。

完整威胁模型见 [WalletPair 安全模型](https://walletpair.org/docs/security)及其 ProVerif 形式化验证。
