/**
 * Remote Inject - Common Utilities
 * Theme (dark/light) + i18n support
 */

// ============ Theme Support ============

const ThemeManager = {
  init() {
    // Check URL parameter first (highest priority for embedded use)
    const urlParams = new URLSearchParams(window.location.search)
    const urlTheme = urlParams.get('theme')

    if (urlTheme === 'dark' || urlTheme === 'light') {
      this.setTheme(urlTheme, false) // Don't save URL-specified theme to localStorage
      return
    }

    // Apply saved theme or detect system preference
    const saved = localStorage.getItem('theme')
    if (saved) {
      this.setTheme(saved)
    } else {
      // Auto-detect system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      this.setTheme(prefersDark ? 'dark' : 'light')
    }

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        this.setTheme(e.matches ? 'dark' : 'light')
      }
    })
  },

  setTheme(theme, save = true) {
    document.documentElement.setAttribute('data-theme', theme)
    if (save) {
      localStorage.setItem('theme', theme)
      // Also set cookie for server-side rendering
      document.cookie = `theme=${theme};path=/;max-age=31536000;SameSite=Lax`
    }
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme')
    this.setTheme(current === 'dark' ? 'light' : 'dark')
  },

  get current() {
    return document.documentElement.getAttribute('data-theme') || 'light'
  }
}

// ============ i18n Support ============

const I18n = {
  // Supported languages
  locales: {
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
    }
  },

  currentLocale: 'en',

  init() {
    // Check URL parameter first (highest priority for embedded use)
    const urlParams = new URLSearchParams(window.location.search)
    const urlLang = urlParams.get('lang')

    if (urlLang && this.locales[urlLang]) {
      this.currentLocale = urlLang
      // Don't save URL-specified locale to localStorage
    } else {
      // Detect language from saved preference or browser
      const saved = localStorage.getItem('locale')
      if (saved && this.locales[saved]) {
        this.currentLocale = saved
      } else {
        // Auto-detect from browser language
        const browserLang = navigator.language.split('-')[0]
        this.currentLocale = this.locales[browserLang] ? browserLang : 'en'
      }
    }

    document.documentElement.setAttribute('lang', this.currentLocale)

    // Auto-translate elements with data-i18n attribute
    this.translatePage()
  },

  setLocale(locale) {
    if (this.locales[locale]) {
      this.currentLocale = locale
      localStorage.setItem('locale', locale)
      // Also set cookie for server-side rendering
      document.cookie = `locale=${locale};path=/;max-age=31536000;SameSite=Lax`
      document.documentElement.setAttribute('lang', locale)
      this.translatePage()
    }
  },

  t(key, params = {}) {
    let text = this.locales[this.currentLocale]?.[key] || this.locales.en[key] || key

    // Replace {param} placeholders
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
    })

    return text
  },

  translatePage() {
    // Find all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n')
      if (key) {
        el.textContent = this.t(key)
      }
    })

    // Find all elements with data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder')
      if (key) {
        el.placeholder = this.t(key)
      }
    })

    // Find all elements with data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title')
      if (key) {
        el.title = this.t(key)
      }
    })
  }
}

// ============ Auto Initialize ============

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init()
    I18n.init()
  })
} else {
  ThemeManager.init()
  I18n.init()
}

// Export for use in pages
window.ThemeManager = ThemeManager
window.I18n = I18n
