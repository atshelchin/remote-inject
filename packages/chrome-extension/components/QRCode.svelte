<script lang="ts">
  import QRCodeLib from 'qrcode'
  import { onMount } from 'svelte'

  let { url }: { url: string } = $props()

  let canvas: HTMLCanvasElement

  onMount(() => {
    renderQR()
  })

  $effect(() => {
    if (url && canvas) renderQR()
  })

  function renderQR() {
    QRCodeLib.toCanvas(canvas, url, {
      width: 220,
      margin: 2,
      color: { dark: '#e2e8f0', light: '#1e293b' },
    })
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(url)
    copied = true
    setTimeout(() => (copied = false), 2000)
  }

  let copied = $state(false)
</script>

<div class="qr-container">
  <canvas bind:this={canvas}></canvas>
  <button class="copy-btn" onclick={copyUrl}>
    {copied ? 'Copied!' : 'Copy Link'}
  </button>
</div>

<style>
  .qr-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  canvas {
    border-radius: 12px;
  }

  .copy-btn {
    background: none;
    border: none;
    color: #64748b;
    font-size: 12px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: color 0.15s;
  }

  .copy-btn:hover {
    color: #94a3b8;
  }
</style>
