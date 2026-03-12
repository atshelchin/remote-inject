import { mount } from 'svelte'
import App from '../popup/App.svelte'

document.body.classList.add('is-sidepanel')

mount(App, {
  target: document.getElementById('app')!,
  props: { sidepanel: true },
})
