import { IconView } from '../../primitives/icon-view'
import { ObsidianDropdown } from '../../primitives/obsidian-dropdown'
import { ObsidianIcon } from '../../primitives/obsidian-icon'

import type { FormTypeRenderer } from './index'
import type { SelectOption } from '../../../domains/core/form'
import type { CSSProperties } from 'react'

function resolveOptionBadgeStyle(option: SelectOption): CSSProperties | undefined {
	if (option.tone === undefined) {
		return undefined
	}

	return {
		backgroundColor: `var(${option.tone.background})`,
		borderColor: `var(${option.tone.border ?? option.tone.background})`,
		color: `var(${option.tone.text})`,
	}
}

function renderOptionLabel(option: SelectOption | null, placeholder: string | undefined) {
	if (option == null) {
		return (
			<span className="lj:min-w-0 lj:flex-1 lj:truncate lj:text-left lj:text-lj-c-hint-faint">
				{placeholder ?? ''}
			</span>
		)
	}

	if (option.tone === undefined) {
		return (
			<span className="lj:min-w-0 lj:flex-1 lj:truncate lj:text-left lj:text-lj-c-strong">
				{option.label}
			</span>
		)
	}

	return (
		<span
			className="lj:inline-block lj:w-14 lj:rounded lj:py-0.5 lj:text-center lj:font-mono lj:text-[10px] lj:font-bold lj:tracking-wider"
			style={resolveOptionBadgeStyle(option)}
		>
			{option.label}
		</span>
	)
}

function renderToneSelectButton(option: SelectOption, selected: boolean, onChange: (value: string) => void) {
	return (
		<button
			key={option.value}
			type="button"
			onClick={() => onChange(option.value)}
			aria-pressed={selected}
			className="lj:inline-flex lj:h-8 lj:min-w-16 lj:items-center lj:justify-center lj:gap-1.5 lj:rounded lj:border lj:px-3 lj:font-mono lj:text-[10px] lj:font-bold lj:tracking-wider lj:transition-shadow lj:hover:shadow-sm"
			style={resolveOptionBadgeStyle(option)}
		>
			<ObsidianIcon name="check" className={`lj:size-3 lj:shrink-0 ${selected ? '' : 'lj:invisible'}`} />
			{option.label}
		</button>
	)
}

export const SelectFormFieldRenderer: FormTypeRenderer<'select'> = ({
	value,
	onChange,
	options,
	placeholder,
	classNames,
}) => {
	if (options.length > 0 && options.every((option) => option.tone !== undefined)) {
		return (
			<div className="lj:flex lj:items-center lj:gap-2">
				{options.map((option) => renderToneSelectButton(option, option.value === value, onChange))}
			</div>
		)
	}

	const dropdownOptions = options.map((option) => ({
		value: option.value,
		label: option.label,
		icon: option.icon === undefined ? undefined : <IconView icon={option.icon} />,
	}))
	const resolveOption = (option: { value: string } | null) =>
		option == null ? null : options.find((candidate) => candidate.value === option.value) ?? null

	return (
		<ObsidianDropdown
			options={dropdownOptions}
			value={value}
			onChange={onChange}
			triggerClassName={classNames?.selectTrigger ?? classNames?.input}
			menuClassName={classNames?.selectMenu}
			optionClassName={(selected) => selected
				? classNames?.selectActiveOption ?? classNames?.selectOption ?? ''
				: classNames?.selectOption ?? ''}
			renderTriggerContent={(selectedOption) => renderOptionLabel(resolveOption(selectedOption), placeholder)}
			renderOptionContent={(option) => renderOptionLabel(resolveOption(option), placeholder)}
		/>
	)
}
