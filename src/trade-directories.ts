import { LUCR_TRADE_ATTACHMENTS_DIR, LUCR_TRADE_ROOT_DIR } from './constant'
import { Domains } from './domains'

const LUCR_TRADE_REQUIRED_CHILD_DIR_ENTRIES = Domains.flatMap((domain) => {
	const persisted = domain.options.persisted
	return [[
		persisted.folderName,
		`${LUCR_TRADE_ROOT_DIR}/${persisted.folderName}`,
	] as const]
})

export const LUCR_TRADE_REQUIRED_DIRS = {
	root: LUCR_TRADE_ROOT_DIR,
	paths: [
		LUCR_TRADE_ROOT_DIR,
		LUCR_TRADE_ATTACHMENTS_DIR,
		...LUCR_TRADE_REQUIRED_CHILD_DIR_ENTRIES.map(([, path]) => path),
	],
}
