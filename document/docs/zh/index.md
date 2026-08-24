---
icon: BookOpen
title: "LucrJournal 概览"
sections:
  - name: 开始使用
    icon: BookOpen
  - name: 核心模型
    icon: Brain
  - name: 仓位记录
    icon: FilePlus
  - name: 复盘与沉淀
    icon: LineChart
  - name: 字段参考
    icon: ListChecks
  - name: 数据与设置
    icon: Settings
  - name: "常见问题"
    icon: CircleHelp
---

## LucrJournal 是什么

LucrJournal 是运行在 Obsidian 里的本地交易日志。它把账户、标的、仓位、新闻、分析和策略手册连在一起，让你从一笔交易回到当时的计划、证据与复盘结论。

你通过 `打开日记` 进入主界面。插件创建的记录保存在当前 Vault 的 `LucrJournal/` 目录中，仍然是可以搜索、链接和管理的 Markdown 文件。

![[screenshot-overview.png]]

## 它适合什么人

LucrJournal 适合愿意持续记录，并希望回答这些问题的人：

- 这笔仓位属于哪个账户、哪个标的？
- 开仓时为什么选择 `做多` 或 `做空`？
- 实际的风险、收益和手续费是多少？
- 哪些新闻、分析、关键位或策略手册与结果有关？
- 哪些做法值得保留，哪些错误正在重复？

如果你不使用 Obsidian，或只想要下单和行情工具，LucrJournal 不是合适的入口。它负责记录和复盘，不替你执行交易或判断方向。

## 先认识四个对象

```mermaid
flowchart LR
    A[平台] --> B[账户]
    B --> C[标的]
    C --> D[仓位]
```

- 平台表示交易来源。
- 账户把不同用途或资金来源分开。
- 标的是某个账户下可记录的交易品种。
- 仓位是一次具体的 `开仓`、持有与 `平仓` 记录。

同一个标的可以分别存在于不同账户中。仓位通过标的找到所属账户，因此创建第一笔仓位前，至少要有一个账户和一个标的。

## 第一次打开前要知道

所有 LucrJournal 视图都需要有效登录和 LucrJournal 权益。第一次运行 `打开日记` 时，你会先看到 `登录`，而不是 `概览`。

登录会在浏览器中完成授权，再回到 Obsidian 检查权益。如果账户尚未开通，界面会显示 `升级以使用 LucrJournal`；完成升级后点击 `已升级，重新检查` 即可，不需要重新登录。

> [!INFO]
> 登录只负责确认身份与权益。交易记录仍保存在当前 Vault 中。

## 推荐阅读路径

1. [[install-lucrjournal]]：安装 Obsidian 和 LucrJournal。
2. [[quickstart]]：完成登录、权益检查和第一笔仓位。
3. [[accounts-and-symbols]]：理解账户、平台、标的及其删除影响。
4. [[record-first-position]]：逐项填写第一条正式仓位记录。
5. [[position-details]]：补充价格、风险、收益、笔记和上下文。
6. [[dashboard-review]]：从 `概览` 和 `仓位` 开始复盘。
7. [[playbooks-and-criteria]]：把重复出现的优势模式沉淀为策略手册。

## 六个章节怎么读

| 章节 | 什么时候读 |
| --- | --- |
| 开始使用 | 安装 Obsidian 和 LucrJournal，完成第一次登录，准备账户和标的。 |
| 核心模型 | 理解上下文和文件之间的关系。 |
| 仓位记录 | 创建、补全、截图识别或复用仓位模板。 |
| 复盘与沉淀 | 回看结果，维护策略手册和条件。 |
| 数据与设置 | 处理导入、本地文件、语言、时区和偏好。 |
| 常见问题 | 快速确认一个具体问题。 |

> [!TIP]
> 第一天只完成一笔可回看的仓位。先把事实记下来，再补证据和上下文，最后总结成策略手册。
