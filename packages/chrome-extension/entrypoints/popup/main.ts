import { mount } from 'svelte'
import App from './App.svelte'

document.body.classList.add('is-popup')

mount(App, { target: document.getElementById('app')! })
