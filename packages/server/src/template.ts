import { Eta } from 'eta'
import { join } from 'path'
import {
  loadExternalConfig,
  getExternalTranslations,
  getExternalLocales,
  hasCustomTheme as configHasCustomTheme,
} from './config'

// Try to import embedded assets (available in compiled mode)
let embeddedTemplates: Record<string, string> | null = null
let isCompiled = false

try {
  // Dynamic import to avoid errors in development
  const embedded = await import('./embedded-assets')
  if (embedded.IS_COMPILED) {
    embeddedTemplates = embedded.getTemplates()
    isCompiled = true
    console.log('[Template] Running in compiled mode with embedded templates')
  }
} catch {
  // Not in compiled mode or embedded-assets not generated yet
}

// Load external configuration (i18n, themes)
await loadExternalConfig()

// Initialize Eta - use different config for compiled vs development mode
const eta = isCompiled
  ? new Eta({
      // In compiled mode, don't set views - we'll use renderString
      cache: true,
      autoEscape: true,
    })
  : new Eta({
      views: join(import.meta.dir, '../templates'),
      cache: process.env.NODE_ENV === 'production',
      autoEscape: true,
    })

// i18n translations
const translations: Record<string, Record<string, string>> = {
  zh: {
    // Common
    'app.name': 'Remote Inject',
    'common.loading': '加载中...',
    'common.error': '错误',
    'common.retry': '重试',
    'common.copy': '复制',
    'common.copied': '已复制!',
    'common.close': '关闭',

    // Landing page
    'landing.title': '连接钱包',
    'landing.connectRequest': '请求连接到您的钱包',
    'landing.checkingWallet': '检测钱包环境...',
    'landing.selectWallet': '检测到多个钱包，请选择：',
    'landing.walletDetected': '检测到 {name}，正在跳转...',
    'landing.noWallet': '未检测到可用钱包',
    'landing.invalidSession': '无效的会话链接',
    'landing.invalidLink': '链接无效或已过期',
    'landing.redirecting': '正在跳转...',
    'landing.useWallet': '点击使用此钱包连接',
    'landing.guideTitle': '请在钱包中打开此链接',
    'landing.guideStep1': '打开您的加密钱包应用',
    'landing.guideStep2': '进入 DApp 浏览器',
    'landing.guideStep3': '粘贴下方链接并访问',
    'landing.copyLink': '复制链接',
    'landing.noWalletEnv': '未检测到钱包环境',

    // Bridge page
    'bridge.title': '连接确认',
    'bridge.connecting': '正在连接...',
    'bridge.pleaseWait': '请稍候',
    'bridge.connected': '已连接',
    'bridge.waitingRequest': '等待应用发起请求',
    'bridge.confirmInWallet': '请在钱包中确认',
    'bridge.requestingAction': '应用正在请求操作',
    'bridge.disconnect': '断开连接',
    'bridge.keepOpen': '保持此页面打开以维持连接',
    'bridge.wallet': '使用钱包',
    'bridge.address': '钱包地址',
    'bridge.network': '当前网络',
    'bridge.error': '出错了',
    'bridge.reconnect': '请重新扫码连接',
    'bridge.invalidLink': '链接无效或已过期，请重新扫描二维码',
    'bridge.noWallet': '请在钱包的 DApp 浏览器中打开此链接',
    'bridge.disconnected': '已断开连接',
    'bridge.userDisconnected': '您已主动断开与应用的连接',
    'bridge.peerDisconnected': '对方已关闭连接',
    'bridge.connectionRejected': '链接无效或已被其他设备使用',
    'bridge.connectionFailed': '链接无效、已过期或已被其他设备使用',
    'bridge.sessionExpired': '链接已过期，请重新扫描二维码',
    'bridge.connectingWallet': '正在连接 {name}...',
    'bridge.authorizeInPopup': '请在弹窗中授权',
    'bridge.noAccount': '请在钱包中授权访问',
    'bridge.connectingApp': '正在连接应用...',
    'bridge.almostDone': '即将完成',
    'bridge.unknownApp': '未知应用',
    'bridge.safeWalletFailed': 'Safe 钱包连接失败',
    'bridge.safeWalletOpenInApps': '请确保在 Safe 钱包的 Apps 中打开此页面',
    'bridge.reconnecting': '重新连接中... ({attempt}/{maxAttempts})',
    'bridge.networkDisconnected': '网络连接断开，正在尝试重连',
    'landing.safeDetected': '检测到 Safe 钱包，正在连接...',

    // Methods
    'method.personal_sign': '签名消息',
    'method.eth_signTypedData_v4': '签名数据',
    'method.eth_sendTransaction': '发送交易',
    'method.wallet_switchEthereumChain': '切换网络',
    'method.wallet_addEthereumChain': '添加网络',
    'method.eth_sign': '签名',

    // Demo page
    'demo.title': 'Remote Inject Demo',
    'demo.subtitle': '在电脑上连接移动钱包，体验跨设备签名',
    'demo.connectWallet': '连接钱包',
    'demo.createConnection': '创建连接',
    'demo.disconnectConnection': '断开连接',
    'demo.connectionStatus': '连接状态',
    'demo.notConnected': '未连接',
    'demo.waitingConnection': '等待连接...',
    'demo.testActions': '测试操作',
    'demo.getAccounts': '获取账户',
    'demo.getChainId': '获取链 ID',
    'demo.getBalance': '获取余额',
    'demo.signMessage': '签名消息',
    'demo.sendTransaction': '发送交易',
  },

  en: {
    // Common
    'app.name': 'Remote Inject',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.retry': 'Retry',
    'common.copy': 'Copy',
    'common.copied': 'Copied!',
    'common.close': 'Close',

    // Landing page
    'landing.title': 'Connect Wallet',
    'landing.connectRequest': 'Requesting to connect to your wallet',
    'landing.checkingWallet': 'Detecting wallet environment...',
    'landing.selectWallet': 'Multiple wallets detected, please select:',
    'landing.walletDetected': 'Detected {name}, redirecting...',
    'landing.noWallet': 'No wallet detected',
    'landing.invalidSession': 'Invalid session link',
    'landing.invalidLink': 'Link is invalid or expired',
    'landing.redirecting': 'Redirecting...',
    'landing.useWallet': 'Click to connect with this wallet',
    'landing.guideTitle': 'Open this link in your wallet',
    'landing.guideStep1': 'Open your crypto wallet app',
    'landing.guideStep2': 'Go to DApp browser',
    'landing.guideStep3': 'Paste the link below and visit',
    'landing.copyLink': 'Copy Link',
    'landing.noWalletEnv': 'No wallet environment detected',

    // Bridge page
    'bridge.title': 'Connection Confirmation',
    'bridge.connecting': 'Connecting...',
    'bridge.pleaseWait': 'Please wait',
    'bridge.connected': 'Connected',
    'bridge.waitingRequest': 'Waiting for app request',
    'bridge.confirmInWallet': 'Please confirm in wallet',
    'bridge.requestingAction': 'App is requesting action',
    'bridge.disconnect': 'Disconnect',
    'bridge.keepOpen': 'Keep this page open to maintain connection',
    'bridge.wallet': 'Wallet',
    'bridge.address': 'Address',
    'bridge.network': 'Network',
    'bridge.error': 'Error',
    'bridge.reconnect': 'Please scan QR code again',
    'bridge.invalidLink': 'Link is invalid or expired, please scan QR code again',
    'bridge.noWallet': 'Please open this link in wallet DApp browser',
    'bridge.disconnected': 'Disconnected',
    'bridge.userDisconnected': 'You have disconnected from the app',
    'bridge.peerDisconnected': 'Remote side has closed the connection',
    'bridge.connectionRejected': 'Link is invalid or already used by another device',
    'bridge.connectionFailed': 'Link is invalid, expired, or used by another device',
    'bridge.sessionExpired': 'Link has expired, please scan QR code again',
    'bridge.connectingWallet': 'Connecting to {name}...',
    'bridge.authorizeInPopup': 'Please authorize in popup',
    'bridge.noAccount': 'Please authorize wallet access',
    'bridge.connectingApp': 'Connecting to app...',
    'bridge.almostDone': 'Almost done',
    'bridge.unknownApp': 'Unknown App',
    'bridge.safeWalletFailed': 'Safe Wallet Connection Failed',
    'bridge.safeWalletOpenInApps': 'Please make sure to open this page in Safe Wallet Apps',
    'bridge.reconnecting': 'Reconnecting... ({attempt}/{maxAttempts})',
    'bridge.networkDisconnected': 'Network disconnected, trying to reconnect',
    'landing.safeDetected': 'Safe Wallet detected, connecting...',

    // Methods
    'method.personal_sign': 'Sign Message',
    'method.eth_signTypedData_v4': 'Sign Data',
    'method.eth_sendTransaction': 'Send Transaction',
    'method.wallet_switchEthereumChain': 'Switch Network',
    'method.wallet_addEthereumChain': 'Add Network',
    'method.eth_sign': 'Sign',

    // Demo page
    'demo.title': 'Remote Inject Demo',
    'demo.subtitle': 'Connect mobile wallet on desktop, experience cross-device signing',
    'demo.connectWallet': 'Connect Wallet',
    'demo.createConnection': 'Create Connection',
    'demo.disconnectConnection': 'Disconnect',
    'demo.connectionStatus': 'Connection Status',
    'demo.notConnected': 'Not Connected',
    'demo.waitingConnection': 'Waiting for connection...',
    'demo.testActions': 'Test Actions',
    'demo.getAccounts': 'Get Accounts',
    'demo.getChainId': 'Get Chain ID',
    'demo.getBalance': 'Get Balance',
    'demo.signMessage': 'Sign Message',
    'demo.sendTransaction': 'Send Transaction',
  },
}

/**
 * Get merged translations for a locale
 * External translations override built-in translations
 */
function getMergedTranslations(locale: string): Record<string, string> {
  const builtIn = translations[locale] || translations.en
  const external = getExternalTranslations(locale)

  // External overrides built-in
  return { ...builtIn, ...external }
}

/**
 * Get all supported locales (built-in + external)
 */
export function getAllLocales(): string[] {
  const builtInLocales = Object.keys(translations)
  const externalLocales = getExternalLocales()
  return [...new Set([...builtInLocales, ...externalLocales])]
}

/**
 * Check if a locale is supported (built-in or external)
 */
function isLocaleSupported(locale: string): boolean {
  return locale in translations || getExternalLocales().includes(locale)
}

// Detect locale from Accept-Language header
export function detectLocale(acceptLanguage?: string): string {
  if (!acceptLanguage) return 'en'

  // Parse Accept-Language header
  const languages = acceptLanguage.split(',').map((lang) => {
    const [code, q = 'q=1'] = lang.trim().split(';')
    return {
      code: code.split('-')[0].toLowerCase(),
      q: parseFloat(q.replace('q=', '')),
    }
  })

  // Sort by quality
  languages.sort((a, b) => b.q - a.q)

  // Find first supported language (built-in or external)
  for (const lang of languages) {
    if (isLocaleSupported(lang.code)) {
      return lang.code
    }
  }

  return 'en'
}

// Get translation function for a locale
export function getTranslator(locale: string) {
  const merged = getMergedTranslations(locale)
  const fallback = getMergedTranslations('en')

  return (key: string, params?: Record<string, string>): string => {
    let text = merged[key] || fallback[key] || key

    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
      })
    }

    return text
  }
}

// Re-export hasCustomTheme for use in templates
export const hasCustomTheme = configHasCustomTheme

// Render template with data
export function render(
  templateName: string,
  data: Record<string, unknown> = {}
): string {
  if (isCompiled && embeddedTemplates) {
    // In compiled mode, use embedded template content
    const templateContent = embeddedTemplates[templateName]
    if (!templateContent) {
      throw new Error(`Template not found: ${templateName}`)
    }
    return eta.renderString(templateContent, data)
  }
  // Development mode: use file-based templates
  return eta.render(templateName, data)
}

// Parse cookies from request
function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {}
  const cookies: Record<string, string> = {}
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=')
    if (name) {
      cookies[name] = rest.join('=')
    }
  })
  return cookies
}

// Render page with locale and theme detection
export function renderPage(
  templateName: string,
  request: Request,
  data: Record<string, unknown> = {}
): string {
  const url = new URL(request.url)
  const cookies = parseCookies(request.headers.get('cookie'))

  // Priority: URL param > cookie > Accept-Language header
  const langParam = url.searchParams.get('lang')
  let locale: string
  if (langParam && isLocaleSupported(langParam)) {
    locale = langParam
  } else if (cookies['locale'] && isLocaleSupported(cookies['locale'])) {
    locale = cookies['locale']
  } else {
    const acceptLanguage = request.headers.get('accept-language') || ''
    locale = detectLocale(acceptLanguage)
  }

  // Priority: URL param > cookie > null (use system/saved preference)
  const themeParam = url.searchParams.get('theme')
  let theme: string | null = null
  if (themeParam === 'dark' || themeParam === 'light') {
    theme = themeParam
  } else if (cookies['theme'] === 'dark' || cookies['theme'] === 'light') {
    theme = cookies['theme']
  }

  const t = getTranslator(locale)

  // Use merged translations (built-in + external overrides)
  const localeTranslations = getMergedTranslations(locale)

  // Safe JSON for embedding in <script> tags
  // Escape < and > to prevent XSS and script tag issues
  const safeJson = JSON.stringify(localeTranslations)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')

  return render(templateName, {
    ...data,
    locale,
    theme, // null means use system/saved preference, otherwise force this theme
    hasCustomTheme: configHasCustomTheme(), // Pass to template for custom CSS loading
    t,
    translations: localeTranslations,
    translationsJson: safeJson,
  })
}

export { eta, translations }
