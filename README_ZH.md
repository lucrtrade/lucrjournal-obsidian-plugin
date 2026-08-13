# LucrJournal

[英文](README.md)

LucrJournal 是一个 Obsidian 插件，把你的交易日志放进你本来就在用的库。每一笔仓位、账户、标的、关键位、新闻、分析和策略手册都以纯 Markdown 文件保存——可搜索、可链接，也完全属于你。

![LucrJournal 概览](document/assets/zh/light/screenshot-overview.png)

## 为什么在 Obsidian 里记日志

- 记录留在你自己的库里。不上云、不锁定：文件是你的，想怎么读、怎么备份、怎么链接都行。
- 一笔交易不只是一条笔记。仓位会连到所属账户、标的、关键位、新闻、市场分析和策略手册，复盘时可以从一笔交易追溯到当时的计划与证据。
- 为复盘设计，不只是记录。仪表盘、筛选和策略手册统计能把已平仓的交易变成可复用的检查项。

## 主要功能

- **仓位记录** — 开仓/平仓生命周期，含入场、出场、止损、目标与笔记；名义价值、风险、盈亏和 R:R 按品种类型（加密货币、期货、CFD）自动计算。
- **上下文区块** — 每笔仓位内直接链接 `新闻`、`关键位`、`Confluence` 和 `市场分析`。
- **策略手册与条件** — 结构化检查清单写回 Markdown，并按实际引用它的仓位计算胜率和净盈亏。
- **证据与 OCR** — 粘贴或拖拽截图作为去重后的附件；本地 OCR 识别 MetaTrader 和 TradingView 截图，写回记录前由你确认结果。
- **图表** — 带入场/出场标记的蜡烛图；期货行情来自 Yahoo，加密货币来自账户对应的交易所（Binance、Bybit、OKX）。
- **标的** — 内置目录（ES、NQ、EURUSD、XAUUSD 等）、规范化命名，TradingView 提供 logo 与类型。
- **模板、更新说明、英文与简体中文界面** — 以及绑定 LucrTrade 账户的权益入口。

## 安装

LucrJournal 已上架 Obsidian 社区插件商店（id：`lucrjournal`）。

1. 设置 → 第三方插件 → 浏览 → 搜索 **LucrJournal** → 安装 → 启用。
2. 运行 `打开日记` 命令，用你的 LucrTrade 账户登录。如果账户还没有 journal 权益，升级界面会说明如何开通——之后无需重新登录。

需要 Obsidian 1.11.4 或更高版本。手动安装：把 `manifest.json`、`main.js`、`styles.css`、`onnxruntime-web/` 和 `ocr/` 复制到 `VaultFolder/.obsidian/plugins/lucrjournal/`，然后重新加载 Obsidian。

## 文档

使用指南、字段参考和常见问题：<https://lucrjournal.lucrtrade.com/docs/>

## 开发

```bash
bun install
bun run dev
bun run build:bundle
bun run test
bun run lint
```

## 许可证

MIT
