import { STORAGE_KEYS, DEFAULT_SERVER_URL, MAX_REQUEST_LOG } from './constants'
import type { ExtensionState, RequestLogEntry } from './types'

function defaultState(): ExtensionState {
  return {
    serverUrl: DEFAULT_SERVER_URL,
    status: 'disconnected',
    requests: [],
  }
}

export async function getState(): Promise<ExtensionState> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.STATE)
  return result[STORAGE_KEYS.STATE] ?? defaultState()
}

export async function saveState(state: ExtensionState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: state })
}

export async function updateState(patch: Partial<ExtensionState>): Promise<ExtensionState> {
  const state = await getState()
  // Only overwrite with non-undefined values; use deleteStateKeys() to explicitly clear fields
  const filtered: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) filtered[k] = v
  }
  const updated = { ...state, ...filtered }
  await saveState(updated)
  return updated
}

export async function clearStateKeys(keys: (keyof ExtensionState)[]): Promise<ExtensionState> {
  const state = await getState()
  for (const k of keys) {
    delete (state as any)[k]
  }
  await saveState(state)
  return state
}

export async function addRequestLog(entry: RequestLogEntry): Promise<void> {
  const state = await getState()
  state.requests = [entry, ...state.requests].slice(0, MAX_REQUEST_LOG)
  await saveState(state)
}

export async function updateRequestLog(requestId: string, patch: Partial<RequestLogEntry>): Promise<void> {
  const state = await getState()
  const idx = state.requests.findIndex(r => r.id === requestId)
  if (idx !== -1) {
    state.requests[idx] = { ...state.requests[idx], ...patch }
    await saveState(state)
  }
}

export async function getServerUrl(): Promise<string> {
  const state = await getState()
  return state.serverUrl
}

export async function saveServerUrl(url: string): Promise<void> {
  await updateState({ serverUrl: url })
}
