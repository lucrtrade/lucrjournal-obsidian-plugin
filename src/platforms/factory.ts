export type PlatformDefinition = {
	name: string
	ccxtId: string | null
	homepage: string
	icon: string
	simpleIcon?: string
}

export function buildPlatform<const T extends PlatformDefinition>(config: T): T {
	return config
}
