export const PORT_NAME_CONTENT = 'remote-inject-content'
export const DEFAULT_SERVER_URL = 'http://localhost:3700'
export const REQUEST_TIMEOUT_MS = 60_000
export const MAX_REQUEST_LOG = 50

export const PROVIDER_INFO = {
  uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
  name: 'Remote Inject Bridge',
  rdns: 'com.remote-inject.bridge',
} as const

export const STORAGE_KEYS = {
  SERVER_URL: 'serverUrl',
  SESSION_DATA: 'sessionData',
  STATE: 'extensionState',
} as const
