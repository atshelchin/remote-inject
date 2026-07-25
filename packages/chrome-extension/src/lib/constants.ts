/** Default WalletPair relay server (Remote Inject speaks the WalletPair protocol over the hosted relay) */
export const DEFAULT_RELAY_URL = 'wss://relay.walletpair.org/v1';

/** Extension display name for EIP-6963 */
export const EXTENSION_NAME = 'Remote Inject';

/** Reverse domain name for EIP-6963 */
export const EXTENSION_RDNS = 'com.remote-inject.bridge';

/** Unique UUID for EIP-6963 provider (stable across sessions) */
export const PROVIDER_UUID = 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6';

/** Message channel name for content script <-> injected script communication */
export const MSG_CHANNEL = 'remote-inject-ext';

/**
 * Bridge page that runs inside a mobile wallet's dApp browser and wraps that
 * wallet's window.ethereum as the WalletPair "wallet" side. The QR encodes
 * `<BRIDGE_URL>#<walletpair-pairing-uri>` so scanning it in any mobile wallet
 * opens the bridge with the pairing data (in the fragment, never sent upstream).
 */
export const BRIDGE_URL = 'https://remoteinject.org/bridge';

/** Chrome storage keys */
export const STORAGE_KEYS = {
  RELAY_URL: 'relayUrl',
  SESSION_STATE: 'sessionState',
  CONNECTED_WALLET: 'connectedWallet',
  SETTINGS: 'settings',
  PERMISSIONS: 'permissions',
  CONNECTED_AT: 'connectedAt',
} as const;
