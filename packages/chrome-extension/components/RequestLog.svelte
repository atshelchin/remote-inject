<script lang="ts">
  import type { RequestLogEntry } from '../lib/types'

  let { requests = [] }: { requests: RequestLogEntry[] } = $props()

  const METHOD_LABELS: Record<string, string> = {
    personal_sign: 'Sign Message',
    eth_signTypedData_v4: 'Sign Typed Data',
    eth_sendTransaction: 'Send Transaction',
    eth_requestAccounts: 'Request Accounts',
    wallet_switchEthereumChain: 'Switch Chain',
    wallet_addEthereumChain: 'Add Chain',
    eth_sign: 'Sign',
  }

  function label(method: string): string {
    return METHOD_LABELS[method] || method
  }

  function timeAgo(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000)
    if (sec < 60) return `${sec}s ago`
    const min = Math.floor(sec / 60)
    return `${min}m ago`
  }
</script>

{#if requests.length > 0}
  <div class="log">
    <h3>Activity</h3>
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
              {req.status === 'pending' ? '…' : req.status === 'completed' ? 'OK' : 'Fail'}
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
