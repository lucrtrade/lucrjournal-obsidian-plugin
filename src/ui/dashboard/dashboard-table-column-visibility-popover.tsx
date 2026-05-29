import { t } from '../../lang/helpers'

import type { Table } from '@tanstack/react-table'

export function DashboardTableColumnVisibilityPopover<TData>({
	table,
	onClose,
}: {
	table: Table<TData>
	onClose: () => void
}) {
	return (
		<>
			<div className="lj:fixed lj:inset-0 lj:z-40" onClick={onClose} />
			<div className="lj:absolute lj:right-0 lj:top-full lj:mt-1 lj:z-50 lj:min-w-[220px] lj:rounded-lg lj:border lj:border-lj-alpha-10 lj:bg-lj-surf-neutral lj:p-3 lj:shadow-lg">
				<div className="lj:mb-2 lj:text-[10px] lj:uppercase lj:tracking-widest lj:text-lj-c-hint">
					{t('DASHBOARD_TABLE_COLUMNS')}
				</div>
				{table.getAllLeafColumns().map((column) => (
					<label
						key={column.id}
						className="lj:flex lj:cursor-pointer lj:items-center lj:gap-2 lj:py-1 lj:text-xs lj:text-lj-c-secondary-dim lj:hover:text-lj-c-strong"
					>
						<input
							type="checkbox"
							checked={column.getIsVisible()}
							onChange={column.getToggleVisibilityHandler()}
							className="lj:rounded lj:border-lj-alpha-20"
						/>
						{column.columnDef.meta?.field?.label?.() ?? column.id}
					</label>
				))}
			</div>
		</>
	)
}
