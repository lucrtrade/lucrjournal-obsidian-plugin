---
icon: HardDrive
title: "本地数据与正文结构"
---

这组问题解释本地数据边界、离线能力，以及 Markdown 正文结构的解析限制。

## 本地保存边界

**我在券商或云端找不到 LucrJournal 的记录。**

记录保存在当前 Vault 的 `LucrJournal/` 中。==LucrJournal 不会自动同步券商历史。==

Vault 的跨设备同步和备份由你使用的 Obsidian 方案负责。

→ [[local-files-and-markdown]]

## 离线可用范围

**断网后，我担心已有记录或本地功能受影响。**

你仍可以创建、编辑和复盘本地记录，也可以运行本地 OCR。网络功能失败不会删除已有记录。

登录、网页来源、远端标的元数据和图表行情需要联网。

→ [[sync-and-import]]

## 围栏标题误判

**代码块里的标题改变了仓位正文结构。**

仓位 section parser 不识别代码围栏，行首的 `# ` 或 `## ` 会被当成真实标题。

> [!TIP] 怎么做
> 调整代码示例，避免井号出现在行首。

→ [[local-files-and-markdown]]
