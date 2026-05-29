import { isValidElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../form', () => ({
	FormRenderer: () => null,
	useDomainForm: () => ({
		values: {},
		entries: [],
		asyncPlaceholders: {},
		canSubmit: true,
		isSubmitting: false,
		submitErrorKey: null,
		updateField: () => undefined,
		handleSubmit: async () => undefined,
	}),
}))

vi.mock('../primitives/modal', () => ({
	Modal: (props: Record<string, unknown>) => ({
		type: 'Modal',
		props,
	}),
}))

import { NewLinkedEntryModal } from './new-linked-entry-modal'

describe('NewLinkedEntryModal', () => {
	it('passes custom max width to the modal shell', () => {
		const rendered = NewLinkedEntryModal({
			app: {} as never,
			formDefinition: {},
			buildInitialFormValues: () => ({}),
			synchronizeFormValues: (value: unknown) => value,
			createEntry: async () => undefined,
			submitLabel: 'Save',
			isOpen: true,
			title: 'Add Symbol',
			onClose: () => undefined,
			maxWidthClassName: 'lj:max-w-md',
		})

		if (!isValidElement<{ maxWidthClassName?: string }>(rendered)) {
			throw new Error('NewLinkedEntryModal did not render an element')
		}
		expect(rendered.props.maxWidthClassName).toBe('lj:max-w-md')
	})
})
