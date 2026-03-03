import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  srcDir: '.',
  manifest: {
    name: 'Remote Inject Bridge',
    description: 'Connect any DApp to your mobile wallet via Remote Inject',
    permissions: ['storage', 'offscreen'],
    minimum_chrome_version: '116',
    icons: {
      128: 'assets/icon.svg',
    },
    web_accessible_resources: [
      {
        resources: ['injected.js'],
        matches: ['<all_urls>'],
      },
    ],
  },
})
