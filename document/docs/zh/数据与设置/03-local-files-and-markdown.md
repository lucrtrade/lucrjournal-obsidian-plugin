---
icon: Folder
title: "本地文件和 Markdown"
---

LucrJournal 的交易记录是当前 Vault 中 `LucrJournal/` 下的 Markdown 和附件。你可以备份、搜索和直接打开它们；结构化界面也会读取并重写其中一部分内容。

## 目录和文件名

| 内容 | 目录 | 文件名 |
| --- | --- | --- |
| 平台 | `LucrJournal/platforms/` | 清洗后的平台名称，例如 `Binance.md`。 |
| 账户 | `LucrJournal/accounts/` | `ACC-{账户名称}.md`。 |
| 标的 | `LucrJournal/symbols/` | `SBL-{账户名称}-{大写代码}.md`。 |
| 仓位 | `LucrJournal/positions/` | `POS-00001.md` 这样的五位递增序号。 |
| 新闻 | `LucrJournal/news/` | 清洗后的新闻名称。 |
| 关键位、Confluence、市场分析 | `LucrJournal/analyses/` | 清洗后的条目名称。 |
| 策略手册 | `LucrJournal/playbooks/` | 清洗后的策略手册名称。 |
| 条件 | `LucrJournal/criteria/` | 清洗后的条件名称。 |
| 仓位模板 | `LucrJournal/templates/` | `TPL-00001.md` 这样的五位递增序号。 |
| 附件 | `LucrJournal/attachments/YYYY-MM/` | 本地时间、毫秒和原文件名组成的名称。 |

LucrJournal 使用不带目录的 wikilink。不同目录中的 Markdown 也不能使用相同的文件名；插件创建条目时会全局检查 basename 冲突。账户、标的或上下文需要改名时，优先使用结构化界面，让关联链接一同更新。

## 一个文件分成两部分

文件开头的 frontmatter 保存类型、关联和结构化字段。正文保存笔记、上下文标题或策略手册条件。

`lucr_type` 决定文件属于仓位还是策略手册等类型。不要直接修改它；无法识别或不符合 schema 的 frontmatter 会让文件留在普通 Markdown 中，并从对应列表和结构化视图中消失。

仓位或策略手册页可以选择 `以 Markdown 打开`。检查完成后，分别选择 `以仓位视图打开` 或 `以策略手册视图打开` 返回结构化界面。

## 仓位正文会怎样重写

新仓位正文默认只有 `# Notes`。关联上下文后，一级标题按以下顺序组织：

1. `# Notes`
2. `# News`
3. `# Key Levels`
4. `# Confluence`
5. `# Market Analysis`

结构化编辑会保留第一个一级标题之前的内容，也会保留其他一级标题及其正文。但每次写回都会重建全部一级标题，统一标题间距、正文首尾空白和文件末尾换行；重复的目标标题可能被合并并丢失其中内容。

删除一个关联条目时，LucrJournal 会重建目标一级标题下识别到的二级标题。该标题下第一个二级标题之前的手写文字会丢失，保留下来的区块空白也会被规范化。批量清理关联时，其他上下文标题也可能被同样重建。

> [!NOTE]
> section parser 不识别代码围栏。代码块里行首的 `# ` 或 `## ` 也会被当作真实标题边界；仓位正文中的代码示例不要让井号出现在行首。

## 策略手册正文会怎样重写

策略手册的结构化正文只承认“一级标题链接条件、二级标题链接 Confluence”的层级。普通标题、三级标题和段落不会进入结构化值。

> [!WARNING]
> 选择 `保存策略手册` 时，LucrJournal 只会逐字保留文件开头格式完整的 frontmatter，并用当前条件和 Confluence 替换其后的全部正文。手写段落、非结构化标题、注释和代码块都会消失；未闭合的开头 frontmatter 也不会保留。

需要保留的解释应写入对应条件、Confluence 或其他独立笔记，不要放在会被策略手册结构化保存覆盖的位置。完整模型见 [[playbooks-and-criteria]]。

## 附件引用不是自动双向同步

把文件粘贴或拖入 `LucrJournal/` 下的 Markdown 时，插件会把它存入附件目录并在正文插入链接。目标是仓位时，同一个引用还会追加到 frontmatter 的 `attachments`；之后这两处不会自动对账。

从仓位界面删除附件只处理 frontmatter 引用，不会扫描或改写正文嵌入。直接删除仓位也只移入仓位文件，不会清理独占附件。删除前先按 [[attachments-chart-ocr]] 检查正文、附件属性和其他仓位引用。

## 直接编辑的安全边界

- 普通笔记、拼写和复盘结论可以直接改，但先判断所在正文是否会被结构化保存重建。
- 不要手动改账户、标的和仓位的文件身份或关联字段；使用对应界面。
- frontmatter 修改后必须仍符合字段规则，否则该文件会被 LucrJournal 跳过。
- 仓位上下文的二级标题必须是完整 wikilink 才会进入结构化模型；无法解析的标题会保留在 Markdown，但不会自动修复。
- 大范围直接编辑前先备份 Vault。

字段含义见 [[account-fields]]、[[symbol-fields]]、[[position-fields]] 和 [[context-playbook-fields]]。遇到文件异常时回到 [[q-and-a]]。
