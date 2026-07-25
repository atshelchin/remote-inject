<script lang="ts">
  import QRCode from 'qrcode';
  import { Copy, Check, ArrowLeft } from 'lucide-svelte';
  import { BRIDGE_URL } from '../lib/constants';
  import { t } from '@/lib/i18n.svelte';

  let { uri, fingerprint, onCancel }: { uri: string; fingerprint?: string; onCancel?: () => void } = $props();

  let qrDataUrl = $state('');
  let copied = $state(false);

  // Scanning this QR in a mobile wallet's dApp browser opens the Remote Inject
  // bridge page with the pairing URI in the fragment (never sent to the server),
  // so it works with any wallet — not just WalletPair-native ones.
  const bridgeLink = $derived(uri ? `${BRIDGE_URL}#${uri}` : '');

  $effect(() => {
    if (bridgeLink) {
      QRCode.toDataURL(bridgeLink, {
        width: 240,
        margin: 2,
        color: { dark: '#172033', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }).then((url: string) => {
        qrDataUrl = url;
      });
    }
  });

  function copyUri() {
    navigator.clipboard.writeText(bridgeLink);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<div class="pairing">
  <div class="status-badge" role="status" aria-live="polite">
    <span class="status-dot"></span>
    {t('Waiting for wallet…', '等待钱包扫描…')}
  </div>

  <div class="qr-container">
    {#if qrDataUrl}
      <img src={qrDataUrl} alt={t('Pairing QR code', '配对二维码')} class="qr-img" />
    {:else}
      <div class="qr-placeholder">
        <span class="spinner"></span>
      </div>
    {/if}
  </div>

  <p class="scan-hint">
    {t(
      'Open the built-in browser in your mobile wallet (MetaMask, OKX, Trust…) and scan from there — not with your phone camera.',
      '请在手机钱包（MetaMask、OKX、Trust 等）内置的 dApp 浏览器中扫描——不要用手机相机扫。',
    )}
  </p>

  {#if fingerprint}
    <div class="fingerprint">
      <span class="fingerprint-label">{t('Pairing code', '配对码')}</span>
      <div class="fingerprint-code">
        {#each [fingerprint.slice(0, 2), fingerprint.slice(2, 4)] as pair}
          <span class="fp-pair">{pair}</span>
        {/each}
      </div>
      <span class="fingerprint-note">
        {t('Make sure these match the code on your phone before approving.', '确认与手机上显示的四位数字一致后，再在手机上确认。')}
      </span>
    </div>
  {/if}

  <div class="actions-row">
    <button class="copy-btn" onclick={copyUri} title={t('Paste into your wallet’s dApp browser', '粘贴到钱包的 dApp 浏览器中')}>
      {#if copied}
        <Check size={13} strokeWidth={2} color="var(--green)" />
        {t('Copied', '已复制')}
      {:else}
        <Copy size={13} strokeWidth={1.5} />
        {t('Copy link', '复制链接')}
      {/if}
    </button>
  </div>

  {#if onCancel}
    <button class="cancel-btn" onclick={onCancel}>
      <ArrowLeft size={14} strokeWidth={1.5} />
      {t('Cancel', '取消')}
    </button>
  {/if}
</div>

<style>
  .pairing {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    animation: fadeIn 0.3s ease-out;
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    padding: 5px 14px;
    border-radius: 100px;
    background: var(--accent-dim);
    color: var(--accent-hover);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .qr-container {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-card);
  }

  .qr-img {
    width: 220px;
    height: 220px;
    image-rendering: pixelated;
    border-radius: 8px;
  }

  .qr-placeholder {
    width: 220px;
    height: 220px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .scan-hint {
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--text-dim);
    text-align: center;
    max-width: 260px;
    margin: -2px 0 2px;
  }

  .fingerprint {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .fingerprint-label {
    font-size: 10px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
  }

  .fingerprint-note {
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-dim);
    text-align: center;
    max-width: 240px;
  }

  .fingerprint-code {
    display: flex;
    gap: 6px;
  }

  .fp-pair {
    font-size: 22px;
    font-weight: 700;
    font-family: 'SF Mono', 'Fira Code', monospace;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 6px 14px;
    color: var(--text);
    letter-spacing: 0.05em;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-card);
    color: var(--text-dim);
    font-size: 12px;
    font-weight: 500;
    padding: 7px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }
  .copy-btn:hover {
    background: var(--bg-hover);
    color: var(--text);
  }

  .actions-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .cancel-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    color: var(--text-dimmer);
    font-size: 12px;
    padding: 6px 0;
  }
  .cancel-btn:hover {
    color: var(--text-dim);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
