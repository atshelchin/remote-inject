import { i18nState, t } from '@shelchin/i18n-sveltekit'
import en from './messages/en.json'
import zh from './messages/zh.json'

type Locale = 'en' | 'zh'
const MESSAGES: Record<Locale, Record<string, string>> = { en, zh }

function detectLocale(): Locale {
  const lang = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase()
  return lang.startsWith('zh') ? 'zh' : 'en'
}

const initial = detectLocale()
i18nState.init({ defaultLocale: initial, fallbackLocale: 'en' })
i18nState.setMessages(MESSAGES[initial])

export { t, i18nState }

export function setLocale(locale: Locale) {
  i18nState.locale = locale
  i18nState.setMessages(MESSAGES[locale])
}

export function getLocale(): Locale {
  return (i18nState.locale as Locale) || initial
}
