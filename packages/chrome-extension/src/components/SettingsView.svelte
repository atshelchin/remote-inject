<script lang="ts">
  import { getSettings, saveSettings } from '@/lib/storage';
  import { DEFAULT_RELAY_URL } from '@/lib/constants';
  import { ArrowLeft, Info } from 'lucide-svelte';
  import { t } from '@/lib/i18n.svelte';

  let { onBack }: { onBack: () => void } = $props();

  let relayUrl = $state(DEFAULT_RELAY_URL);
  let saved = $state(false);

  $effect(() => {
    getSettings().then((s) => {
      relayUrl = s.relayUrl;
    });
  });

  async function save() {
    await saveSettings({ relayUrl });
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }

  function resetRelay() {
    relayUrl = DEFAULT_RELAY_URL;
  }
</script>

<div class="settings">
  <div class="settings-header">
    <button class="back-btn" onclick={onBack} aria-label={t('Back', '返回')}>
      <ArrowLeft size={16} strokeWidth={1.5} />
    </button>
    <span class="settings-title">{t('Settings', '设置')}</span>
  </div>

  <div class="settings-body">
    <div class="info-card">
      <span style="flex-shrink: 0; margin-top: 1px; display: flex;">
        <Info size={14} strokeWidth={2} color="var(--accent)" />
      </span>
      <p>{t('Remote Inject is a transparent bridge. Signing and transaction confirmations happen in your wallet, not here.', 'Remote Inject 是一个透明的桥接工具。签名与交易确认都在你的钱包中完成，而非此处。')}</p>
    </div>

    <section class="section">
      <h3 class="section-label">{t('Relay Server', '中继服务器')}</h3>
      <input
        type="url"
        class="input"
        bind:value={relayUrl}
        placeholder="wss://relay.walletpair.org/v1"
      />
      {#if relayUrl !== DEFAULT_RELAY_URL}
        <button class="btn-reset" onclick={resetRelay}>{t('Reset to default', '恢复默认')}</button>
      {/if}
      <p class="relay-note">{t('Changing the relay re-pairs your wallet.', '更换中继需要重新配对你的钱包。')}</p>
    </section>

    <button class="btn-save" onclick={save}>
      {saved ? t('Saved!', '已保存！') : t('Save', '保存')}
    </button>
  </div>
</div>

<style>
  .settings {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .settings-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 16px;
  }

  .back-btn {
    background: none;
    color: var(--text-dim);
    padding: 6px;
    border-radius: 8px;
    display: flex;
    align-items: center;
  }
  .back-btn:hover {
    background: var(--bg-hover);
    color: var(--text);
  }

  .settings-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .info-card {
    display: flex;
    gap: 10px;
    padding: 10px 14px;
    background: var(--accent-dim);
    border: 1px solid rgba(37, 99, 235, 0.12);
    border-radius: 10px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-dim);
  }

  .settings-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-dim);
  }

  .input {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 12px;
    color: var(--text);
    font-family: 'SF Mono', 'Fira Code', monospace;
    outline: none;
    width: 100%;
  }
  .input:focus {
    border-color: var(--accent);
  }

  .btn-reset {
    background: none;
    color: var(--text-dimmer);
    font-size: 11px;
    padding: 0;
    text-align: left;
  }
  .btn-reset:hover {
    color: var(--accent);
  }

  .relay-note {
    font-size: 11px;
    color: var(--text-dim);
    line-height: 1.4;
  }

  .btn-save {
    background: var(--accent);
    color: white;
    font-size: 13px;
    font-weight: 600;
    padding: 12px 20px;
    border-radius: 10px;
    width: 100%;
    margin-top: auto;
    box-shadow: 0 2px 10px rgba(37, 99, 235, 0.2);
  }
  .btn-save:hover {
    background: var(--accent-hover);
    box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3);
  }
</style>
