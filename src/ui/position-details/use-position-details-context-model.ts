import { type App, type TFile } from 'obsidian'
import { useEffect, useState } from 'react'

import {
	buildPositionDetailsContextModel,
	createEmptyPositionDetailsContextModel,
	isPositionDetailsDataPath,
	type PositionDetailsContextModel,
} from '../../domains'

export function usePositionDetailsContextModel({
	app,
	positionFile,
}: {
	app: App
	positionFile: TFile | null
}): PositionDetailsContextModel {
	const [model, setModel] = useState<PositionDetailsContextModel>(() => createEmptyPositionDetailsContextModel(app))

	useEffect(() => {
		let disposed = false
		let requestId = 0

		const refresh = async () => {
			const currentRequestId = requestId + 1
			requestId = currentRequestId
			const nextModel = await buildPositionDetailsContextModel(app, positionFile)

			if (!disposed && currentRequestId === requestId) {
				setModel(nextModel)
			}
		}

		const refreshForPath = (path: string | null | undefined) => {
			if (path === undefined || path === null || isPositionDetailsDataPath(path)) {
				void refresh()
			}
		}

		void refresh()

		const metadataEvents = [
			app.metadataCache.on('changed', (file) => refreshForPath(file.path)),
			app.metadataCache.on('deleted', (file) => refreshForPath(file.path)),
			app.metadataCache.on('resolved', () => {
				void refresh()
			}),
		]
		const vaultEvents = [
			app.vault.on('create', (file) => refreshForPath(file.path)),
			app.vault.on('delete', (file) => refreshForPath(file.path)),
			app.vault.on('rename', (file, oldPath) => {
				if (isPositionDetailsDataPath(file.path) || isPositionDetailsDataPath(oldPath)) {
					void refresh()
				}
			}),
		]

		return () => {
			disposed = true
			metadataEvents.forEach((eventRef) => app.metadataCache.offref(eventRef))
			vaultEvents.forEach((eventRef) => app.vault.offref(eventRef))
		}
	}, [app, positionFile?.path])

	return model
}
