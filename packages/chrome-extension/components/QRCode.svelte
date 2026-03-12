<script lang="ts">
  import QRCodeLib from 'qrcode'
  import { onMount } from 'svelte'
  import { t } from '../lib/i18n'

  let { url, theme = 'dark' }: { url: string; theme?: 'light' | 'dark' } = $props()

  let canvas: HTMLCanvasElement

  onMount(() => { renderQR() })
  $effect(() => { if (url && canvas) renderQR() })

  function renderQR() {
    const light = theme === 'light'
    QRCodeLib.toCanvas(canvas, url, {
      width: 216,
      margin: 2,
      color: light
        ? { dark: '#1a1a1e', light: '#ebebee' }
        : { dark: '#edeef1', light: '#1b1b1f' },
    })
  }

  let copied = $state(false)

  async function copyUrl() {
    await navigator.clipboard.writeText(url)
    copied = true
    setTimeout(() => (copied = false), 1800)
  }
</script>

<div class="qr-wrap">
  <canvas bind:this={canvas}></canvas>
  <button class="copy-link" onclick={copyUrl}>
    {#if copied}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M1.5 6l3 3 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      {t('btn.copied')}
    {:else}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M4 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <rect x="4" y="1" width="4" height="2.5" rx="0.8" stroke="currentColor" stroke-width="1.2"/>
      </svg>
      {t('btn.copy_link')}
    {/if}
  </button>
</div>

<style>
  .qr-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  canvas {
    border-radius: 8px;
    display: block;
  }

  .copy-link {
    background: none;
    border: 1px solid var(--ln);
    border-radius: 6px;
    color: var(--t3);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    padding: 4px 10px;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: color 0.12s, border-color 0.12s;
  }
  .copy-link:hover { color: var(--t2); border-color: var(--ln2); }
</style>
