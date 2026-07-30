---
icon: Trash2
title: "删除与级联影响"
---

这组问题解释重命名或删除账户、标的、仓位、附件和 Confluence 时的级联影响。

## 改名中途失败

**账户改名失败后，关联文件有的改了、有的没改。**

账户改名会逐个改写账户、标的和仓位引用，没有自动回滚。==中途失败时，已经完成的改写会保留。==

> [!WARNING] 怎么做
> 改名前确认新名称不与已有文件冲突并备份 Vault，过程中不要关闭 Obsidian；失败后逐层检查关联。

→ [[accounts-and-symbols]] · [[account-fields]]

## 账户删除范围

**删除账户的确认列表里还有标的、仓位，甚至平台。**

`删除账户？` 会删除整条下游关系。

自建平台名称只有大小写差异时，共享判断可能不符合预期。

> [!WARNING] 怎么做
> 确认前核对列出的文件；出现 `平台文件（唯一账户）` 时还要检查其他账户。

→ [[accounts-and-symbols]]

## 标的删除范围

**删除标的后，关联仓位也不见了。**

`确认删除` 会先移入该标的的关联仓位，再移入标的文件。

仓位附件不会随之清理。

> [!WARNING] 怎么做
> 删除前先处理仓位中的证据。

→ [[accounts-and-symbols]] · [[attachments-chart-ocr]]

## 仓位附件残留

**仓位删掉了，附件还留在 Vault 里。**

直接删除仓位只移入仓位文件，不清理 `LucrJournal/attachments/` 中的独占附件。

需要删除的附件应先从仓位界面处理。

→ [[position-lifecycle]] · [[attachments-chart-ocr]]

## 正文图片断链

**删除附件后，Markdown 正文里的图片坏了。**

`删除附件` 只移除 frontmatter 引用，不扫描 Markdown 正文。==即使正文仍嵌入图片，独占物理文件也可能被删除。==

> [!WARNING] 怎么做
> 确认前先用 `以 Markdown 打开` 检查正文。

→ [[attachments-chart-ocr]] · [[local-files-and-markdown]]

## 手册引用断链

**删除 Confluence 后，策略手册里留下了断链。**

从 `分析` 删除 Confluence 会清理仓位链接，但不会改写策略手册正文。

删除前先确认没有策略手册继续引用它。

→ [[context-notes]] · [[playbooks-and-criteria]]
