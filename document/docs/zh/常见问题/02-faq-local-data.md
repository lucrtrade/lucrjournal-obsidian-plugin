---
icon: HardDrive
title: "本地数据与正文结构"
---

这组问题解释本地数据边界、离线能力，以及 Markdown 正文结构的解析限制。

## 数据保存在哪里？会自动同步券商或云端吗？

记录保存在当前 Vault 的 `LucrJournal/`中。LucrJournal 不会自动同步券商历史；Vault 的跨设备同步和备份由你使用的 Obsidian 方案负责。详见 [[local-files-and-markdown]]。

## 断网后还能做什么？

可以继续创建、编辑和复盘本地记录，也可以运行本地 OCR。登录、网页来源、远端标的元数据和图表行情需要联网，失败不会删除已有记录。详见 [[sync-and-import]]。

## 为什么代码块里的标题改变了仓位正文结构？

仓位 section parser 不识别代码围栏，行首的 `# `或`## `会被当成真实标题。调整代码示例，避免井号出现在行首。详见 [[local-files-and-markdown]]。
