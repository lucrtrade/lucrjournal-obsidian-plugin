/// <reference types="vitest/importMeta" />

import { useCallback, useEffect, useRef, useState } from 'react'

import { ObsidianIcon } from './obsidian-icon'

import type { KeyboardEvent, ReactNode } from 'react'

type EditableFieldProps = {
	value: string
	onSave: (value: string) => void
	align?: 'left' | 'right'
	displayNode?: ReactNode
	inputType?: 'text' | 'number'
	inputMode?: 'text' | 'numeric' | 'decimal'
	min?: number | string
	step?: number | string
	placeholder?: string
	className?: string
	inputClassName?: string
}

export function EditableField({
	value,
	onSave,
	align = 'left',
	displayNode,
	inputType = 'text',
	inputMode,
	min,
	step,
	placeholder,
	className,
	inputClassName,
}: EditableFieldProps) {
	const [isEditing, setIsEditing] = useState(false)
	const [draft, setDraft] = useState(value)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (isEditing) {
			setDraft(value)
			inputRef.current?.focus()
			inputRef.current?.select()
		}
	}, [isEditing, value])

	const commit = useCallback(() => {
		setIsEditing(false)
		const trimmed = draft.trim()
		if (trimmed !== value) {
			onSave(trimmed)
		}
	}, [draft, value, onSave])

	const handleKeyDown = useCallback((event: KeyboardEvent) => {
		switch (event.key) {
			case 'Enter':
				commit()
				break
			case 'Escape':
				setIsEditing(false)
				break
			default:
				break
		}
	}, [commit])

	if (isEditing) {
		return (
			<input
				ref={inputRef}
				type={inputType}
				inputMode={inputMode}
				min={min}
				step={step}
				value={draft}
				placeholder={placeholder}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commit}
				onKeyDown={handleKeyDown}
				className={getEditableFieldInputClassName(align, inputClassName)}
			/>
		)
	}

	return (
		<button
			type="button"
			onClick={() => setIsEditing(true)}
			className={getEditableFieldButtonClassName(align, className)}
		>
			<span className={getEditableFieldDisplayClassName(align)}>
				{displayNode ?? <span className="lj:text-lj-c-strong">{value}</span>}
			</span>
			<ObsidianIcon
				name="pencil"
				className={getEditableFieldIconClassName(align)}
			/>
		</button>
	)
}

function getEditableFieldButtonClassName(align: 'left' | 'right', className?: string) {
	return `lj:group/edit lj:inline-flex lj:items-center lj:gap-1 lj:rounded lj:px-1 lj:-mx-1 lj:transition-colors lj:hover:bg-lj-alpha-5 lj:cursor-text ${align === 'right' ? 'lj:relative lj:w-full lj:justify-end lj:text-right lj:overflow-visible' : ''} ${className ?? ''}`.trim()
}

function getEditableFieldDisplayClassName(align: 'left' | 'right') {
	return align === 'right' ? 'lj:block lj:min-w-0 lj:w-full lj:text-right' : ''
}

function getEditableFieldIconClassName(align: 'left' | 'right') {
	return `lj:size-3 lj:text-lj-c-hint-faint lj:opacity-0 lj:group-hover/edit:opacity-100 lj:transition-opacity lj:shrink-0 ${align === 'right' ? 'lj:absolute lj:right-1' : ''}`.trim()
}

function getEditableFieldInputClassName(align: 'left' | 'right', inputClassName?: string) {
	return `lj:px-1.5 lj:py-0.5 lj:rounded lj:bg-lj-alpha-5 lj:text-lj-c-strong lj:text-xs lj:font-mono lj:focus:outline-none lj:focus:ring-1 lj:focus:ring-lj-c-hint ${align === 'right' ? 'lj:w-full lj:text-right' : 'lj:text-left'} ${inputClassName ?? ''}`.trim()
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest

	describe('getEditableFieldButtonClassName', () => {
		it('keeps the default inline layout for left aligned fields', () => {
			expect(getEditableFieldButtonClassName('left')).toContain('lj:inline-flex')
			expect(getEditableFieldButtonClassName('left')).not.toContain('lj:justify-end')
		})

		it('expands right aligned fields so display values and pencil sit on the trailing edge', () => {
			expect(getEditableFieldButtonClassName('right')).toContain('lj:w-full')
			expect(getEditableFieldButtonClassName('right')).toContain('lj:justify-end')
			expect(getEditableFieldButtonClassName('right')).toContain('lj:text-right')
			expect(getEditableFieldButtonClassName('right')).toContain('lj:overflow-visible')
		})
	})

	describe('getEditableFieldDisplayClassName', () => {
		it('makes right aligned display content fill the value column', () => {
			expect(getEditableFieldDisplayClassName('right')).toContain('lj:w-full')
			expect(getEditableFieldDisplayClassName('right')).toContain('lj:text-right')
		})
	})

	describe('getEditableFieldIconClassName', () => {
		it('pins right aligned edit icons to the trailing edge instead of shifting the value', () => {
			expect(getEditableFieldIconClassName('right')).toContain('lj:absolute')
			expect(getEditableFieldIconClassName('right')).toContain('lj:right-1')
		})
	})

	describe('getEditableFieldInputClassName', () => {
		it('keeps left aligned inputs text-left', () => {
			expect(getEditableFieldInputClassName('left')).toContain('lj:text-left')
			expect(getEditableFieldInputClassName('left')).not.toContain('lj:w-full lj:text-right')
		})

		it('makes right aligned inputs fill the slot and edit from the trailing edge', () => {
			expect(getEditableFieldInputClassName('right')).toContain('lj:w-full')
			expect(getEditableFieldInputClassName('right')).toContain('lj:text-right')
		})
	})
}
