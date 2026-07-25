<script lang="ts">
  import { t } from '@/lib/i18n.svelte';

  let { method = '', origin = '' }: { method?: string; origin?: string } = $props();

  function formatMethod(m: string): string {
    if (m.includes('signTypedData')) return t('Sign Typed Data', '签署类型化数据');
    if (m.includes('personal_sign')) return t('Sign Message', '签署消息');
    if (m.includes('sendTransaction')) return t('Send Transaction', '发送交易');
    if (m.includes('signTransaction')) return t('Sign Transaction', '签署交易');
    return m;
  }
</script>

{#if method}
  <div class="toast" role="status" aria-live="polite">
    <span class="toast-dot"></span>
    <span class="toast-text">
      <strong>{formatMethod(method)}</strong> · {t('confirm in wallet', '请在钱包中确认')}
    </span>
  </div>
{/if}

<style>
  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 32px;
    padding: 0 12px;
    border-radius: 8px;
    background: var(--orange-dim);
    border: 1px solid rgba(245, 158, 11, 0.2);
    font-size: 12px;
    color: var(--text);
    animation: slideIn 0.2s ease-out;
  }

  .toast-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--orange);
    flex-shrink: 0;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .toast-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .toast-text strong {
    font-weight: 600;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
