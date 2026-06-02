import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

var script = resolve('.agents/skills/batch-generate-examples/scripts/generate-examples-batch.ts');
var config = JSON.stringify({
	enabled: ['positions'],
	tradeTreeShape: {
		platformMode: 'mixed',
		platformCount: 3,
		accountsPerPlatform: 1,
		symbolsPerAccount: 2,
	},
	positionShape: {
		positionCount: 6,
		openRatio: 0,
	},
	seed: 99,
});

describe('generate examples batch', () => {
	it('generates stable position ids for the same config', () => {
		var dir = mkdtempSync(join(tmpdir(), 'lucrjournal-examples-'));
		try {
			var first = run(dir);
			var second = run(dir);
			expect(second).toBe(first);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('links generated playbooks to varied counts averaging about four positions', () => {
		var dir = mkdtempSync(join(tmpdir(), 'lucrjournal-examples-'));
		try {
			execFileSync('bun', [script, '--config', JSON.stringify({
				enabled: ['playbooks', 'positions'],
				tradeTreeShape: {
					platformMode: 'mixed',
					platformCount: 3,
					accountsPerPlatform: 1,
					symbolsPerAccount: 2,
				},
				positionShape: {
					positionCount: 32,
					openRatio: 0,
				},
				knowledgeShape: {
					playbookCount: 8,
				},
				seed: 99,
			})], { cwd: dir, stdio: 'pipe' });
			var counts = countPositionPlaybooks(dir);
			expect(counts.size).toBe(8);
			var values = [...counts.values()];
			for (var count of counts.values()) {
				expect(count).toBeGreaterThanOrEqual(1);
				expect(count).toBeLessThanOrEqual(10);
			}
			expect(average(values)).toBe(4);
			expect(new Set(values).size).toBeGreaterThan(1);
			expect(Math.min(...values)).toBeLessThan(4);
			expect(Math.max(...values)).toBeGreaterThan(4);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('generates crypto perp and spot symbols', () => {
		var dir = mkdtempSync(join(tmpdir(), 'lucrjournal-examples-'));
		try {
			execFileSync('bun', [script, '--config', JSON.stringify({
				enabled: ['positions'],
				tradeTreeShape: {
					platformMode: 'crypto-only',
					platformCount: 3,
					accountsPerPlatform: 1,
					symbolsPerAccount: 4,
				},
				positionShape: {
					positionCount: 12,
					openRatio: 0,
				},
				seed: 99,
			})], { cwd: dir, stdio: 'pipe' });
			var symbolFiles = readdirSync(join(dir, 'examples/symbols')).sort();
			expect(symbolFiles).toEqual(expect.arrayContaining([
				'SBL-Binance-BTCUSDT.P.md',
				'SBL-Binance-BTCUSDT.md',
				'SBL-Bybit-ETHUSDT.P.md',
				'SBL-Bybit-ETHUSDT.md',
				'SBL-OKX-SOLUSDT.P.md',
				'SBL-OKX-SOLUSDT.md',
			]));
			for (var file of symbolFiles) {
				var content = readFileSync(join(dir, 'examples/symbols', file), 'utf8');
				expect(content).toMatch(/^type: "Crypto_(?:Perp|Spot)"$/m);
				expect(content).toMatch(/^name: "[A-Z0-9]+USDT(?:\.P)?"$/m);
				expect(content).toMatch(/^logo: "https:\/\/s3-symbol-logo\.tradingview\.com\/crypto\/XTVC[A-Z0-9]+\.svg"$/m);
			}
			expect(readFileSync(join(dir, 'examples/positions/POS-00001.md'), 'utf8')).toMatch(/^symbol: "\[\[SBL-Binance-BTCUSDT\.P\]\]"$/m);
			expect(readFileSync(join(dir, 'examples/positions/POS-00002.md'), 'utf8')).toMatch(/^symbol: "\[\[SBL-Binance-BTCUSDT\]\]"$/m);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('keeps generated profits in a realistic display range', () => {
		var dir = mkdtempSync(join(tmpdir(), 'lucrjournal-examples-'));
		try {
			execFileSync('bun', [script, '--config', JSON.stringify({
				enabled: ['playbooks', 'positions'],
				tradeTreeShape: {
					platformMode: 'mixed',
					platformCount: 6,
					accountsPerPlatform: 8,
					symbolsPerAccount: 1,
				},
				positionShape: {
					positionCount: 192,
					openRatio: 0,
				},
				knowledgeShape: {
					playbookCount: 48,
				},
				seed: 1337,
			})], { cwd: dir, stdio: 'pipe' });
			var profits = readPositionProfits(dir);
			expect(percentile(profits, 0.95)).toBeLessThan(15000);
			expect(profits.at(-1)).toBeLessThan(50000);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('does not group generated positions by symbol type', () => {
		var dir = mkdtempSync(join(tmpdir(), 'lucrjournal-examples-'));
		try {
			execFileSync('bun', [script, '--config', JSON.stringify({
				enabled: ['positions'],
				tradeTreeShape: {
					platformMode: 'mixed',
					platformCount: 6,
					accountsPerPlatform: 3,
					symbolsPerAccount: 3,
				},
				positionShape: {
					positionCount: 60,
					openRatio: 0,
				},
				seed: 1337,
			})], { cwd: dir, stdio: 'pipe' });
			expect(maxRun(readPositionSymbolTypes(dir))).toBeLessThan(8);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('generates positions for every ohlcv crypto platform and crypto type', () => {
		var dir = mkdtempSync(join(tmpdir(), 'lucrjournal-examples-'));
		try {
			execFileSync('bun', [script, '--config', JSON.stringify({
				enabled: ['positions'],
				tradeTreeShape: {
					platformMode: 'mixed',
					platformCount: 6,
					accountsPerPlatform: 1,
					symbolsPerAccount: 2,
				},
				positionShape: {
					positionCount: 12,
					openRatio: 0,
				},
				seed: 1337,
			})], { cwd: dir, stdio: 'pipe' });
			expect(positionPlatformTypes(dir)).toEqual(expect.arrayContaining([
				'Binance:Crypto_Perp',
				'Binance:Crypto_Spot',
				'Bybit:Crypto_Perp',
				'Bybit:Crypto_Spot',
				'OKX:Crypto_Perp',
				'OKX:Crypto_Spot',
			]));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('rejects position configs that cannot cover every ohlcv platform crypto type', () => {
		var dir = mkdtempSync(join(tmpdir(), 'lucrjournal-examples-'));
		try {
			expect(() => execFileSync('bun', [script, '--config', JSON.stringify({
				enabled: ['positions'],
				tradeTreeShape: {
					platformMode: 'mixed',
					platformCount: 3,
					accountsPerPlatform: 1,
					symbolsPerAccount: 2,
				},
				positionShape: {
					positionCount: 5,
					openRatio: 0,
				},
				seed: 1337,
			})], { cwd: dir, stdio: 'pipe' })).toThrow(/positionCount must cover every ohlcv platform crypto type/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('rejects futures-only position configs because they cannot cover ohlcv crypto platforms', () => {
		var dir = mkdtempSync(join(tmpdir(), 'lucrjournal-examples-'));
		try {
			expect(() => execFileSync('bun', [script, '--config', JSON.stringify({
				enabled: ['positions'],
				tradeTreeShape: {
					platformMode: 'futures-only',
					platformCount: 3,
					accountsPerPlatform: 1,
					symbolsPerAccount: 2,
				},
				positionShape: {
					positionCount: 6,
					openRatio: 0,
				},
				seed: 1337,
			})], { cwd: dir, stdio: 'pipe' })).toThrow(/platformMode must include ohlcv crypto platforms/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

function run(dir) {
	execFileSync('bun', [script, '--config', config], { cwd: dir, stdio: 'pipe' });
	return readFileSync(join(dir, 'examples/positions/POS-00001.md'), 'utf8');
}

function countPositionPlaybooks(dir) {
	var counts = new Map();
	for (var file of readdirSync(join(dir, 'examples/positions')).filter(name => name.endsWith('.md'))) {
		var content = readFileSync(join(dir, 'examples/positions', file), 'utf8');
		var playbook = content.match(/^playbook: "\[\[([^\]]+)\]\]"/m)?.[1];
		if (playbook) counts.set(playbook, (counts.get(playbook) || 0) + 1);
	}
	return counts;
}

function average(values) {
	return values.reduce((total, value) => total + value, 0) / values.length;
}

function readPositionProfits(dir) {
	return readdirSync(join(dir, 'examples/positions'))
		.filter(name => name.endsWith('.md'))
		.map(name => {
			var content = readFileSync(join(dir, 'examples/positions', name), 'utf8');
			return Math.abs(Number(content.match(/^profit: ([^\n]+)/m)?.[1] || 0));
		})
		.sort((left, right) => left - right);
}

function readPositionSymbolTypes(dir) {
	var types = new Map();
	for (var file of readdirSync(join(dir, 'examples/symbols'))) {
		var content = readFileSync(join(dir, 'examples/symbols', file), 'utf8');
		types.set(file.replace(/\.md$/, ''), content.match(/^type: "([^"]+)"/m)?.[1]);
	}
	return readdirSync(join(dir, 'examples/positions'))
		.filter(name => name.endsWith('.md'))
		.sort()
		.map(file => {
			var content = readFileSync(join(dir, 'examples/positions', file), 'utf8');
			var symbol = content.match(/^symbol: "\[\[([^\]]+)\]\]"/m)?.[1];
			return types.get(symbol);
		});
}

function positionPlatformTypes(dir) {
	var symbolEntries = new Map();
	for (var file of readdirSync(join(dir, 'examples/symbols'))) {
		var content = readFileSync(join(dir, 'examples/symbols', file), 'utf8');
		symbolEntries.set(file.replace(/\.md$/, ''), {
			account: content.match(/^account: "\[\[([^\]]+)\]\]"/m)?.[1],
			type: content.match(/^type: "([^"]+)"/m)?.[1],
		});
	}
	var accountPlatforms = new Map();
	for (var file of readdirSync(join(dir, 'examples/accounts'))) {
		var content = readFileSync(join(dir, 'examples/accounts', file), 'utf8');
		accountPlatforms.set(file.replace(/\.md$/, ''), content.match(/^platform: "\[\[([^\]]+)\]\]"/m)?.[1]);
	}
	return readdirSync(join(dir, 'examples/positions'))
		.filter(name => name.endsWith('.md'))
		.sort()
		.map(file => {
			var content = readFileSync(join(dir, 'examples/positions', file), 'utf8');
			var symbol = content.match(/^symbol: "\[\[([^\]]+)\]\]"/m)?.[1];
			var entry = symbolEntries.get(symbol);
			return `${accountPlatforms.get(entry?.account)}:${entry?.type}`;
		});
}

function maxRun(values) {
	var max = 0;
	var run = 0;
	var last = undefined;
	for (var value of values) {
		run = value === last ? run + 1 : 1;
		last = value;
		if (run > max) max = run;
	}
	return max;
}

function percentile(values, ratio) {
	return values[Math.floor((values.length - 1) * ratio)];
}
