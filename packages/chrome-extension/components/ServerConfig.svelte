<script lang="ts">
  let { serverUrl = 'http://localhost:3700', onConnect }: { serverUrl: string; onConnect: (url: string) => void } = $props()

  let url = $state(serverUrl)

  // Sync when prop changes (e.g. after loading saved state from storage)
  $effect(() => {
    url = serverUrl
  })

  function handleSubmit(e: Event) {
    e.preventDefault()
    const trimmed = url.trim().replace(/\/+$/, '')
    if (trimmed) onConnect(trimmed)
  }
</script>

<form onsubmit={handleSubmit}>
  <label for="server-url">Server URL</label>
  <input
    id="server-url"
    type="url"
    bind:value={url}
    placeholder="http://localhost:3700"
    required
  />
  <button type="submit" class="btn primary">Connect</button>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  label {
    font-size: 12px;
    color: #94a3b8;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  input {
    padding: 10px 12px;
    border: 1px solid #334155;
    border-radius: 8px;
    background: #1e293b;
    color: #e2e8f0;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  input:focus {
    border-color: #3b82f6;
  }
</style>
