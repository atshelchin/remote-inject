# Chrome Web Store 上架完整记录

---

## 一、商品详情（Dashboard → 商品详情）

### 名称

```
Remote Inject
```

### 简短描述（132 字符限制）

```
Use any web3 dApp on desktop while signing with your mobile wallet — end-to-end encrypted, no browser wallet required.
```

### 详细描述（英文）

→ 见 [store-listing.md](store-listing.md) 英文部分

### 详细描述（中文）

→ 见 [store-listing.md](store-listing.md) 中文部分

### 类别

```
Productivity
```

### 语言

```
English (en)
```

### 隐私政策网址

```
（需要你托管 docs/privacy-policy.html 后填入 URL）
例：https://remoteinject.org/privacy-policy.html
```

---

## 二、单一用途说明（Dashboard → 隐私权实践）

```
Injects a standard EIP-1193 / EIP-6963 wallet provider into web pages and relays signing requests to a WalletPair-compatible mobile wallet over an end-to-end encrypted WalletPair channel, enabling any dApp to work with a mobile wallet without a browser wallet extension.
```

---

## 三、权限理由（Dashboard → 隐私权实践）

### 需请求 `storage` 的理由

```
The extension saves data locally: (1) the WalletPair relay URL, so users don't re-enter it; (2) the encrypted session state (channel keys and sequence counters), so the bridge reconnects automatically when the user returns to a dApp without re-scanning the QR code; (3) the list of dApp origins the user has authorized. No personal data or browsing history is stored.
```

### 需请求 `sidePanel` 的理由

```
The extension offers a side panel mode so users can keep the pairing QR code and connection status visible alongside the dApp without the popup closing on navigation. This is important when the user needs to scan the QR code or monitor the connection while actively using a dApp.
```

### 需请求 `alarms` 的理由

```
MV3 service workers are terminated after a short period of inactivity, which drops the WebSocket connection to the relay. The extension uses a periodic alarm as a keepalive/reconnect backstop: when the alarm fires it either sends an encrypted keepalive over the live channel or rebuilds the channel from the saved session snapshot, so signing requests from the dApp continue to reach the mobile wallet reliably.
```

### 需请求主机权限的理由（`host_permissions: <all_urls>`）

```
The wallet provider (window.ethereum + EIP-6963) must be injected at document_start, before the dApp's own JavaScript executes. This is a technical requirement of the EIP-1193 and EIP-6963 standards: dApps detect wallet presence during initialization, so the provider must already exist when they run. activeTab cannot satisfy this because it only grants access after explicit user interaction, by which point the dApp has already initialized and failed to detect the wallet. The content scripts only inject the provider object and bridge encrypted messages — they do not read, collect, or transmit page content.
```

### 是否使用远程代码

```
否 — 不，我并未使用远程代码
```

所有 JS 均由 WXT/Vite 在构建时打包进 zip。连接中继服务器是数据通信（加密 WebSocket 帧），不是加载远程代码，没有 eval() 或 new Function()。

---

## 四、GitHub Secrets（自动发布用）

在 GitHub → Settings → Secrets and variables → Actions 中添加：

| Secret 名称           | 说明                                     | 状态 |
| --------------------- | ---------------------------------------- | ---- |
| `CWS_EXTENSION_ID`  | Dashboard 首次上传后从 URL 获取          |      |
| `CWS_CLIENT_ID`     | Google Cloud Console OAuth 凭据          |      |
| `CWS_CLIENT_SECRET` | Google Cloud Console OAuth 凭据          |      |
| `CWS_REFRESH_TOKEN` | 按 cws-oauth-setup.md 执行 curl 命令获取 |      |

---

## 五、上架 Checklist

### 代码 & 构建

- [X] 图标五尺寸：`public/icon/{16,32,48,96,128}.png`（WXT 自动生成 manifest icons）
- [X] manifest 名称：`Remote Inject`
- [X] 权限最小化：`storage` / `sidePanel` / `alarms` + `host_permissions: <all_urls>`
- [X] GitHub Action 支持自动发布（`release-extension.yml`）
- [X] `bun run zip` 构建验证通过

### Chrome Developer Dashboard

- [ ] 注册开发者账号并支付 $5
- [ ] 首次手动上传 zip（New Item → 保存草稿）→ 获取 Extension ID
- [ ] 填写名称、简短描述
- [ ] 填写详细描述（英文 + 中文，见 store-listing.md）
- [ ] 选择类别：Productivity
- [ ] 上传截图（至少 1 张，1280×800 或 640×400）
- [ ] 上传图标（128×128，从 `public/icon/128.png` 取）
- [ ] 填写隐私政策 URL

### 隐私权实践页

- [ ] 填写单一用途说明
- [ ] 填写 `storage` 权限理由
- [ ] 填写 `sidePanel` 权限理由
- [ ] 填写 `alarms` 权限理由
- [ ] 填写主机权限理由
- [ ] 选择"不使用远程代码"

### 隐私政策托管

- [ ] 将 `docs/privacy-policy.html` 部署到公开 URL
- [ ] 在 Dashboard 填入该 URL

### GitHub Secrets（自动发布）

- [ ] 添加 `CWS_EXTENSION_ID`
- [ ] 创建 Google Cloud OAuth 凭据，添加 `CWS_CLIENT_ID` + `CWS_CLIENT_SECRET`
- [ ] 执行 curl 命令获取 refresh token，添加 `CWS_REFRESH_TOKEN`
- [ ] 将你的 Google 账号加入 OAuth 同意屏幕的 Test users

### 提交审核

- [ ] 点击"提交审核"
- [ ] 等待 1–3 个工作日
```
