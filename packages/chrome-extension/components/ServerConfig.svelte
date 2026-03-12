<script lang="ts">
  let { serverUrl = 'https://remote-inject.awesometools.dev', onConnect }:
    { serverUrl: string; onConnect: (url: string) => void } = $props()

  let url = $state(serverUrl)

  // Sync when prop changes (e.g. after loading saved state from storage)
  $effect(() => { url = serverUrl })

  function handleSubmit(e: Event) {
    e.preventDefault()
    const trimmed = url.trim().replace(/\/+$/, '')
    if (trimmed) onConnect(trimmed)
  }
</script>

<form onsubmit={handleSubmit}>
  <div class="input-wrap">
    <svg class="input-icon" width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/>
      <path d="M4.5 7c0-1.4.6-2.6 1.5-3.3M9.5 7c0 1.4-.6 2.6-1.5 3.3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M2 7h10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity=".4"/>
    </svg>
    <input
      id="server-url"
      type="url"
      bind:value={url}
      placeholder="https://remote-inject.awesometools.dev"
      spellcheck="false"
      autocomplete="off"
      required
    />
  </div>
  <button type="submit" class="btn-primary">Connect</button>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-icon {
    position: absolute;
    left: 10px;
    color: var(--t3);
    pointer-events: none;
  }

  input {
    width: 100%;
    padding: 9px 12px 9px 30px;
    border: 1px solid var(--ln);
    border-radius: 8px;
    background: var(--s1);
    color: var(--t1);
    font-size: 14px;
    font-family: var(--mono);
    outline: none;
    transition: border-color 0.12s;
  }

  input::placeholder {
    color: var(--t3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }

  input:focus {
    border-color: var(--accent);
  }
</style>
