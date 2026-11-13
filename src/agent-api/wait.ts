/** Poll `check` until it returns a non-null value or the timeout elapses (then returns null). */
export async function waitForValue<T>(check: () => T | null | Promise<T | null>, timeoutMs: number, intervalMs = 50): Promise<T | null> {
	const deadline = Date.now() + timeoutMs
	for (;;) {
		const value = await check()
		if (value !== null) {
			return value
		}
		if (Date.now() >= deadline) {
			return null
		}
		await new Promise<void>((resolve) => {
			window.setTimeout(resolve, intervalMs)
		})
	}
}
