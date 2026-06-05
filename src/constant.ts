declare const __LUCRJOURNAL_CHART_VERSION__: string
declare const __LUCRJOURNAL_CHART_IFRAME_URL__: string
declare const __LUCRJOURNAL_APP_URL__: string

export const LUCR_JOURNAL_VIEW_TYPE = 'lucrjournal-view'
export const LUCR_POSITION_VIEW_TYPE = 'lucrjournal-position-view'
export const LUCR_PLAYBOOK_VIEW_TYPE = 'lucrjournal-playbook-view'
export const OPEN_JOURNAL_COMMAND_ID = 'open-journal'
export const LUCR_TRADE_ROOT_DIR = 'LucrJournal'
export const LUCR_TRADE_ATTACHMENTS_DIR = `${LUCR_TRADE_ROOT_DIR}/attachments`

export const APP_URL = typeof __LUCRJOURNAL_APP_URL__ === 'string'
	? __LUCRJOURNAL_APP_URL__
	: 'https://app.lucrtrade.com'

const LUCRCHART_URL = 'https://lucrchart.lucrtrade.com/'
export const LUCRCHART_IFRAME_URL = typeof __LUCRJOURNAL_CHART_IFRAME_URL__ === 'string'
	? __LUCRJOURNAL_CHART_IFRAME_URL__
	: `${LUCRCHART_URL.replace(/\/$/, '')}/lc/${__LUCRJOURNAL_CHART_VERSION__}`
export const LUCRCHART_ORIGIN = new URL(LUCRCHART_IFRAME_URL).origin
