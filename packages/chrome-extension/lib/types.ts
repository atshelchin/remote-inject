// ============================================================
// Extension State
// ============================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'waiting' | 'connected'

export interface ExtensionState {
  serverUrl: string
  status: ConnectionStatus
  sessionId?: string
  sessionUrl?: string
  account?: string
  chainId?: string
  requests: RequestLogEntry[]
}

export interface RequestLogEntry {
  id: string
  method: string
  status: 'pending' | 'completed' | 'failed'
  timestamp: number
  error?: string
}

// ============================================================
// Messages: Injected Script <-> Content Script (window.postMessage)
// ============================================================

export const MSG_SOURCE_INJECTED = 'remote-inject-injected' as const
export const MSG_SOURCE_CONTENT = 'remote-inject-content' as const

export type InjectedToContentMessage = {
  source: typeof MSG_SOURCE_INJECTED
  type: 'rpc_request'
  requestId: string
  method: string
  params?: unknown
}

export type ContentToInjectedMessage =
  | {
      source: typeof MSG_SOURCE_CONTENT
      type: 'rpc_response'
      requestId: string
      result?: unknown
      error?: { code: number; message: string }
    }
  | {
      source: typeof MSG_SOURCE_CONTENT
      type: 'event'
      event: 'connect' | 'disconnect' | 'chainChanged' | 'accountsChanged'
      data: unknown
    }
  | {
      source: typeof MSG_SOURCE_CONTENT
      type: 'state_update'
      accounts: string[]
      chainId: string
      connected: boolean
    }

// ============================================================
// Messages: Content Script <-> Background (chrome.runtime.Port)
// ============================================================

export type ContentToBackgroundMessage = {
  type: 'rpc_request'
  requestId: string
  method: string
  params?: unknown
}

export type BackgroundToContentMessage =
  | {
      type: 'rpc_response'
      requestId: string
      result?: unknown
      error?: { code: number; message: string }
    }
  | {
      type: 'event'
      event: 'connect' | 'disconnect' | 'chainChanged' | 'accountsChanged'
      data: unknown
    }
  | {
      type: 'state_update'
      accounts: string[]
      chainId: string
      connected: boolean
    }

// ============================================================
// Messages: Background <-> Offscreen (chrome.runtime.sendMessage)
// ============================================================

export type BackgroundToOffscreenMessage =
  | { target: 'offscreen'; type: 'connect'; serverUrl: string }
  | { target: 'offscreen'; type: 'disconnect' }
  | { target: 'offscreen'; type: 'request'; requestId: string; method: string; params?: unknown }
  | { target: 'offscreen'; type: 'resume'; serverUrl: string; sessionId: string; sessionUrl: string }

export type OffscreenToBackgroundMessage =
  | { target: 'background'; type: 'state_update'; state: OffscreenProviderState }
  | { target: 'background'; type: 'response'; requestId: string; result?: unknown; error?: { code: number; message: string } }
  | { target: 'background'; type: 'event'; event: string; data: unknown }

export interface OffscreenProviderState {
  status: ConnectionStatus
  sessionId?: string
  sessionUrl?: string
  account?: string
  chainId?: string
  error?: string
}

// ============================================================
// Messages: Popup <-> Background (chrome.runtime.sendMessage)
// ============================================================

export type PopupToBackgroundMessage =
  | { type: 'popup_connect'; serverUrl: string }
  | { type: 'popup_disconnect' }
  | { type: 'popup_get_state' }

export type BackgroundToPopupResponse = {
  state: ExtensionState
}
