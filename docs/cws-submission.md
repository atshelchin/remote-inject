# Chrome Web Store 上架完整记录

---

## 一、商品详情（Dashboard → 商品详情）

### 名称

```
Remote Inject Bridge
```

### 简短描述（132 字符限制）

```
Use any web3 DApp on desktop while signing with your mobile wallet — no MetaMask or browser wallet required.
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
English (en)  +  中文简体 (zh-CN)
```

### 隐私政策网址

```
（需要你托管 docs/privacy-policy.html 后填入 URL）
例：https://awesometools.dev/privacy-policy
```

---

## 二、单一用途说明（Dashboard → 隐私权实践）

```
Injects an EIP-1193 wallet provider into web pages and relays signing requests to a mobile wallet via a relay server, enabling any DApp to work with a mobile wallet without a browser wallet extension.
```

---

## 三、权限理由（Dashboard → 隐私权实践）

### 需请求 `storage` 的理由

```
The extension saves two items locally: (1) the user's relay server URL, so they don't need to re-enter it on every visit; (2) the active session ID, so the bridge reconnects automatically when the user returns to a DApp without requiring them to scan the QR code again. No personal data or browsing history is stored.
```

### 需请求 `offscreen` 的理由

```
The extension uses an offscreen document to maintain a persistent SSE (Server-Sent Events) connection to the relay server. MV3 service workers are terminated after a short period of inactivity, which would drop the bridge connection. The offscreen document keeps the connection alive while the user browses, so signing requests from the DApp are reliably forwarded to the mobile wallet.
```

### 需请求 `sidePanel` 的理由

```
The extension offers a side panel mode so users can keep the bridge interface visible alongside the DApp without the popup closing on navigation. This is important when the user needs to scan the QR code or monitor bridge status while actively using a DApp.
```

### 需请求 `activeTab` 的理由

```
The activeTab permission is used in the popup to send a message to the content script in the active tab, which reads the page's background color to adapt the popup and side panel theme to match the webpage's light or dark mode. This interaction only occurs when the user explicitly opens the extension popup. No tab URLs, titles, or page content are read or transmitted.
```

### 需请求主机权限的理由（content_scripts `<all_urls>`）

```
The wallet provider (window.ethereum) must be injected at document_start, before the DApp's own JavaScript executes. This is a technical requirement of the EIP-1193 and EIP-6963 standards: DApps detect wallet presence during their initialization, so the provider must already exist when they run. activeTab cannot satisfy this requirement because it only grants access after explicit user interaction, by which point the DApp has already initialized and failed to detect the wallet. The content script itself does not read, collect, or transmit any page content — it only injects a single JavaScript object into the page context.
```

### 是否使用远程代码

```
否 — 不，我并未使用远程代码
```

所有 JS 均由 WXT/Vite 在构建时打包进 zip，连接中继服务器是数据通信（SSE + JSON），不是加载远程代码，没有 eval() 或 new Function()。

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

### 代码 & 构建（已完成 ✅）

- [X] 图标三尺寸：`icon-16.png` / `icon-48.png` / `icon-128.png`
- [X] manifest i18n：`__MSG_appName__` / `__MSG_appDesc__`
- [X] `_locales/en/messages.json` + `_locales/zh_CN/messages.json`
- [X] 权限最小化：`tabs` → `activeTab`
- [X] GitHub Action 支持自动发布（`release-extension.yml`）
- [X] `bun run zip` 构建验证通过（150kB）

### Chrome Developer Dashboard

- [X] 注册开发者账号并支付 $5
- [X] 首次手动上传 zip（New Item → 保存草稿）→ 获取 Extension ID
- [X] 填写名称、简短描述
- [X] 填写详细描述（英文 + 中文，见 store-listing.md）
- [X] 选择类别：Productivity
- [X] 上传截图（至少 1 张，1280×800 或 640×400）
- [X] 上传图标（128×128，从 `assets/icon-128.png` 取）
- [X] 填写隐私政策 URL

### 隐私权实践页

- [X] 填写单一用途说明
- [X] 填写 `storage` 权限理由
- [X] 填写 `offscreen` 权限理由
- [X] 填写 `sidePanel` 权限理由
- [X] 填写 `activeTab` 权限理由
- [X] 填写主机权限理由
- [X] 选择"不使用远程代码"

### 隐私政策托管

- [X] 将 `docs/privacy-policy.html` 部署到公开 URL
- [X] 在 Dashboard 填入该 URL

### GitHub Secrets（自动发布）

- [X] 添加 `CWS_EXTENSION_ID`
- [X] 创建 Google Cloud OAuth 凭据，添加 `CWS_CLIENT_ID` + `CWS_CLIENT_SECRET`
- [X] 执行 curl 命令获取 refresh token，添加 `CWS_REFRESH_TOKEN`
- [X] 将你的 Google 账号加入 OAuth 同意屏幕的 Test users

### 提交审核

- [X] 点击"提交审核"
- [X] 等待 1–3 个工作日
