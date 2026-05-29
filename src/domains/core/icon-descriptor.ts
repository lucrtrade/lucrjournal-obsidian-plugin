import type { UiColorVar } from './ui'

type ResolveIconDescriptorOptions = {
	fallbackImageName?: string
}

export function resolveIconDescriptor(
	icon: string | null | undefined,
	options: ResolveIconDescriptorOptions = {},
): IconDescriptor | undefined {
	const normalizedIcon = icon?.trim() ?? ''
	if (normalizedIcon.length === 0) {
		return options.fallbackImageName == null
			? undefined
			: { kind: 'image', value: options.fallbackImageName }
	}

	if (isUrlIcon(normalizedIcon)) {
		return { kind: 'url', value: normalizedIcon }
	}

	if (isEmojiIcon(normalizedIcon)) {
		return { kind: 'emoji', value: normalizedIcon }
	}

	return { kind: 'lucide', value: normalizedIcon }
}

function isUrlIcon(value: string) {
	return /^https?:\/\//i.test(value)
}

function isEmojiIcon(value: string) {
	return /\p{Extended_Pictographic}/u.test(value)
}

export type IconDescriptor = ({ kind: 'image'; value: string }  |
{ kind: 'platform'; value: string }  |
{ kind: 'lucide'; value: string; color?: UiColorVar }  |
{ kind: 'emoji'; value: string }  |
{ kind: 'url'; value: string } )
