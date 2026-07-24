import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Remote Inject',
    description: 'Bridge any dApp to your mobile wallet via the open WalletPair protocol — no registration, end-to-end encrypted.',
    permissions: ['storage', 'sidePanel', 'alarms'],
    host_permissions: ['<all_urls>'],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    web_accessible_resources: [
      {
        resources: ['icon/*'],
        matches: ['<all_urls>'],
      },
    ],
  },
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      // Remove default_popup so clicking the icon opens the side panel instead
      if (manifest.action) {
        delete (manifest.action as any).default_popup;
      }
    },
  },
});
