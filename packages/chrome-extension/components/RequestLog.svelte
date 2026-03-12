<script lang="ts">
  import type { RequestLogEntry } from '../lib/types'
  import { t } from '../lib/i18n'

  let { requests = [] }: { requests: RequestLogEntry[] } = $props()

  const METHOD_KEYS: Record<string, string> = {
    personal_sign: 'method.personal_sign',
    eth_signTypedData_v4: 'method.eth_signTypedData_v4',
    eth_sendTransaction: 'method.eth_sendTransaction',
    eth_requestAccounts: 'method.eth_requestAccounts',
    wallet_switchEthereumChain: 'method.wallet_switchEthereumChain',
    wallet_addEthereumChain: 'method.wallet_addEthereumChain',
    eth_sign: 'method.eth_sign',
  }

  function label(method: string): string {
    const key = METHOD_KEYS[method]
    return key ? t(key) : method
  }

  function timeAgo(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000)
    if (sec < 60) return t('time.s_ago', { n: sec })
    const min = Math.floor(sec / 60)
    return t('time.m_ago', { n: min })
  }
</script>

{#if requests.length > 0}
  <div class="log">
    <h3>{t('activity')}</h3>
    <ul>
      {#each requests.slice(0, 10) as req (req.id)}
        <li>
          <span class="method">{label(req.method)}</span>
          <span class="meta">
            <span
              class="status"
              class:pending={req.status === 'pending'}
              class:completed={req.status === 'completed'}
              class:failed={req.status === 'failed'}
            >
              {req.status === 'pending' ? '…' : req.status === 'completed' ? t('status.ok') : t('status.fail')}
            </span>
            <span class="time">{timeAgo(req.timestamp)}</span>
          </span>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .log {
    background: var(--s1);
    border: 1px solid var(--ln);
    border-radius: var(--r);
    padding: 11px 13px;
  }

  h3 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--t3);
    margin-bottom: 8px;
    font-weight: 600;
  }

  ul {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
  }

  .method {
    color: var(--t1);
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .status.pending   { background: var(--amber-bg); color: var(--amber); }
  .status.completed { background: var(--green-bg);  color: var(--green); }
  .status.failed    { background: var(--red-bg);    color: var(--red);   }

  .time {
    font-size: 11px;
    color: var(--t3);
  }
</style>
