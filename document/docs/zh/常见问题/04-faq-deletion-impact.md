---
icon: Trash2
title: "删除与级联影响"
---

这组问题解释重命名或删除账户、标的、仓位、附件和 Confluence 时的级联影响。

## 账户改名失败后该怎么办？

账户改名会逐个改写账户、标的和仓位引用，没有自动回滚。改名前确认新名称不与已有文件冲突并备份 Vault，过程中不要关闭 Obsidian；失败后逐层检查关联。详见 [[accounts-and-symbols]] 和 [[account-fields]]。

## 为什么删除账户会包含标的、仓位甚至平台？

`删除账户？`会删除整条下游关系；确认前核对列出的文件。自建平台名称只有大小写差异时，共享判断可能不符合预期，出现`平台文件（唯一账户）`时要检查其他账户。详见 [[accounts-and-symbols]]。

## 为什么删除标的后关联仓位也没了？

`确认删除`会先移入该标的的关联仓位，再移入标的文件。仓位附件不会随之清理，删除前先处理证据。详见 [[accounts-and-symbols]] 和 [[attachments-chart-ocr]]。

## 为什么删了仓位但附件还在？

直接删除仓位只移入仓位文件，不清理 `LucrJournal/attachments/`中的独占附件。需要删除的附件应先从仓位界面处理。详见 [[position-lifecycle]] 和 [[attachments-chart-ocr]]。

## 为什么删除附件后正文图片坏了？

`删除附件`只移除 frontmatter 引用，不扫描 Markdown 正文；即使正文仍嵌入图片，独占物理文件也可能被删除。确认前先用`以 Markdown 打开`检查正文。详见 [[attachments-chart-ocr]] 和 [[local-files-and-markdown]]。

## 为什么删除 Confluence 后策略手册留下断链？

从`分析`删除 Confluence 会清理仓位链接，但不会改写策略手册正文。删除前先确认没有策略手册继续引用它。详见 [[context-notes]] 和 [[playbooks-and-criteria]]。
