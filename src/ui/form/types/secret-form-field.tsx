import { SecretComponent } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import type { FormTypeRenderer } from './index'

export const SecretFormFieldRenderer: FormTypeRenderer<'secret'> = ({
	app,
	value,
	placeholder,
	buttonLabel,
	onChange,
	classNames,
}) => {
	if (app === undefined) {
		throw new Error('renderSecretFormField requires app context')
	}

	const hostRef = useRef<HTMLDivElement>(null)
	const componentRef = useRef<SecretComponent | null>(null)
	const changeHandlerRef = useRef(onChange)
	const shouldAutoRevealRef = useRef(false)
	const [isOpen, setIsOpen] = useState(value.trim() !== '')

	useEffect(() => {
		changeHandlerRef.current = onChange
	}, [onChange])

	useEffect(() => {
		if (!isOpen) {
			return
		}

		const host = hostRef.current
		if (host == null) {
			return
		}

		host.replaceChildren()
		const component = new SecretComponent(app, host)
			.setValue(value)
			.onChange((nextValue) => changeHandlerRef.current(nextValue))
		componentRef.current = component

		const revealButton = host.querySelector('button')
		if (shouldAutoRevealRef.current && revealButton != null) {
			shouldAutoRevealRef.current = false
			revealButton.click()
		}

		return () => {
			componentRef.current = null
			host.replaceChildren()
		}
	}, [app, isOpen, value])

	useEffect(() => {
		if (value.trim() !== '') {
			setIsOpen(true)
		}
	}, [value])

	useEffect(() => {
		if (!isOpen) {
			return
		}

		componentRef.current?.setValue(value)
	}, [isOpen, value])

	if (!isOpen) {
		return (
			<button
				type="button"
				onClick={() => {
					shouldAutoRevealRef.current = true
					setIsOpen(true)
				}}
				className={classNames?.secretButton}
			>
				{buttonLabel ?? placeholder}
			</button>
		)
	}

	return (
		<div
			ref={hostRef}
			aria-label={placeholder}
			className={classNames?.secretHost}
		/>
	)
}
