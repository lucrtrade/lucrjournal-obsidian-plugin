# 隐私政策

最后更新：2026-05-21

本隐私政策说明 LucrTrade 在 LucrJournal 中如何处理信息。LucrJournal 是一个运行在 Obsidian 内的插件，用于交易日志、交易记录复盘、交易计划、条件、市场分析以及相关记录管理。

LucrJournal 采用本地优先（local-first）方式运行。除非用户主动使用需要外部请求的功能，日志记录默认保存在用户自己的 Obsidian 库中。

## 运营方与联系方式

LucrJournal 的运营方为 LucrTrade。

联系方式：[contact@lucrtrade.com](mailto:contact@lucrtrade.com)

## 本插件处理的信息

LucrJournal 可能处理用户创建、导入、编辑或要求插件派生的信息，包括：

- 本地日志记录，例如交易记录、账户、交易标的、新闻、分析、条件、交易计划、模板、Markdown 内容和标签；
- 交易相关字段，例如平台、账户名称、交易标的、手续费、订单、价格、数量、附件、备注和图表状态；
- 用户附加到交易记录，或提交给文字识别（OCR）功能的图片、剪贴板图片数据；
- 用户添加的新闻来源、来源预览或关联分析上下文中的外部网址（URL）；
- 插件设置和偏好，例如语言、时区、自动维护修改时间的策略和表格偏好；
- 本地运行时缓存，例如图表开高低收量（OHLCV）缓存和网址预览缓存。

当前实现不会创建由 LucrTrade 托管的账户系统，也不会保存或传输交易所 API 凭证。

## 信息保存在哪里

LucrJournal 主要把信息保存在用户设备上：

- 持久化日志记录是用户 Obsidian 库中的 Markdown 文件，通常位于 `LucrJournal/` 目录下；
- 交易记录附件写入 Obsidian 库，当前位于 `LucrJournal/attachments/`；
- 插件设置通过 Obsidian 插件数据存储保存；
- 图表状态和其他持久化领域字段保存在 Markdown 文件头元数据（frontmatter）中；
- 运行时缓存可能使用按 Obsidian 库隔离的内存和 IndexedDB；
- 文字识别（OCR）运行时和模型资产可能在首次使用后缓存在本地插件目录中。

按当前产品实现，LucrTrade 不提供 LucrJournal 云端账户、托管工作区或内建同步服务。

## 发起外部请求的场景

用户使用需要远端资源的功能时，LucrJournal 可能发起外部网络请求：

- 图表功能可能加载来自 `https://lucrchart.lucrtrade.com/` 的 LucrChart；
- 图表历史请求可能通过 `ccxt` 和 Obsidian `requestUrl` 请求交易所端点的市场数据；
- 新闻创建、来源预览和页面标题功能可能请求用户提供的网址（URL）；
- 新闻来源导入会请求 `https://defuddle.md/{source-url}`，把用户提供的来源网址转换为 Markdown；
- 页面标题和来源预览功能在无法直接读取页面元数据时，也可能请求 `defuddle.md` 作为备用处理方式；
- 来源预览界面可能请求来源网站的网站图标（favicon），或请求 `https://icons.duckduckgo.com/ip3/{hostname}.ico`；
- 文字识别功能可能从仓库资产镜像下载相应运行时和模型资产，路径形如 `https://raw.githubusercontent.com/lucrtrade/lucrjournal-obsidian-plugin/main/assets/ocr/...`。

文字识别所需资产就绪后，识别过程在本地插件运行时中执行。按当前流程，LucrJournal 不会为了文字识别把用户图片主动发送给远端服务。

这些请求由具体功能触发。用户不使用图表、文字识别、新闻来源、预览或导入功能时，对应功能不需要发起这些外部请求。

## 第三方服务

交易所端点、来源网站、`defuddle.md`、DuckDuckGo 网站图标地址、GitHub Raw 资源托管、LucrChart、Obsidian 以及其他第三方服务，适用各自的条款和隐私做法。LucrTrade 不控制这些第三方服务。

## 当前不包含的能力

基于本政策对应的当前实现，LucrJournal 不包含：

- LucrTrade 托管的用户账户系统；
- 内建云同步；
- 内建广告；
- 内建付款、订阅、退款或付费计划处理；
- 当前代码库审查中可识别的产品遥测或分析功能；
- 经纪、托管、订单执行或交易咨询服务。

## 用户的控制方式

用户可以通过选择使用哪些功能来限制信息处理范围。例如，用户可以：

- 只使用 LucrJournal 管理本地 Markdown 记录；
- 不添加外部网址；
- 不使用图表、文字识别、来源预览或导入功能；
- 编辑或删除本地 Obsidian 库文件、附件、插件设置和 Obsidian 备份；
- 在 Obsidian 提供相关控制的情况下清理本地浏览器或运行时存储。

## 数据保留与安全边界

由于 LucrJournal 采用本地优先方式运行，数据保留主要由用户设备、Obsidian 库、Obsidian 同步或备份选择，以及本地存储设置决定。

LucrTrade 不承诺本地存储、Obsidian、第三方服务、来源网站、市场数据端点或用户设备不会发生数据丢失、泄露、中断或被滥用。用户应自行维护备份，并保护设备和 Obsidian 库的访问权限。

## 未成年人

LucrJournal 并非专门面向儿童设计。未成年人应仅在适用规则允许，并获得适当许可和监督的情况下使用 LucrJournal。

## 本政策的变更

LucrTrade 可以通过发布修订版本更新本隐私政策。更新后的版本自其标注的“最后更新”日期起适用。

## 联系方式

如有 LucrJournal 隐私相关问题，可以联系 [contact@lucrtrade.com](mailto:contact@lucrtrade.com)。
