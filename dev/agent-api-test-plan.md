# Agent API v2 测试目标

对象：`app.plugins.plugins.lucrjournal.api`（version 2）。环境：真实 Obsidian，本地测试库 `lucrjournal_local_test`，已登录。
所有调用只走接口；只有标注「模拟人工编辑」的步骤才直接改文件。

## 通用目标（每个操作都要满足）

- G1 返回值永远是 `{ ok: true, ... }` 或 `{ ok: false, error: { code, message, fix } }`，不抛异常、不卡死。
- G2 未知字段、错误类型、缺必填项都被拒绝，且库里没有任何变化。
- G3 `dryRun: true` 不落盘；返回的预览与真实执行的结果一致。
- G4 写入后，界面读到的数据（`getPosition` / `listEntries` / 文件内容）与返回值一致。
- G5 失败的写操作不留下半成品文件。
- G6 `describe()` 里写的字段、取值和示例，与实际行为一致。

## A 组：仓位生命周期

- A1 `createPosition` 基线：建仓、自动建标的、返回路径。
- A2 `listPositions`：按 symbol / account / status / side / from / to / playbook / limit 过滤，排序为最新在前。
- A3 `getPosition`：用路径、`POS-00001`、纯数字三种写法都能定位；返回 links、attachments、notes、rev。
- A4 `updatePosition` 改价格、数量、时间、信心；派生字段（profit / risk / fee）重算。
- A5 平仓：传 `exit_price` 或 `closed_at` 后状态为已平仓，盈亏正确；`status: "open"` 能重新打开。
- A6 止损方向错误、数量类型与标的不符、`closed_at` 早于 `opened_at`、notes 里带一级标题：全部拒绝且不落盘。
- A7 notes 只追加，原有文字不变。
- A8 `ifRev`：模拟人工编辑后，旧 rev 返回 `CONFLICT`；用新 rev 重试成功且人工内容保留。

## B 组：上下文条目与图片

- B1 `createEntry` 四种类型，各自的字段（news: source / impact；confluence: public；通用: description / tags / body）。
- B2 news 带真实 `source` URL：正文按界面逻辑抓取，失败时不报错。
- B3 重名、把 `impact` 用在非 news 上：拒绝。
- B4 `updateEntry`：改字段、清空字段（null / `[]`）、追加正文。
- B5 `linkContext`：关联已有条目、重复关联返回 exists、条目不存在时自动创建。
- B6 `unlinkContext`：只移除链接，条目保留，仓位其余正文不变。
- B7 `addAttachments`：约 2 MB 的 PNG 走 `sourcePath` 成功；小图走 base64 成功；非图片、不存在的路径被拒绝。
- B8 `removeAttachment`：按 token、路径、文件名三种写法都能移除；文件保留。
- B9 `saveAttachment` 与 `open`（仓位、策略手册、普通条目）。

## C 组：策略手册、模板、标的、改名、删除

- C1 `createPlaybook`：条件分组与 Confluence 结构正确，缺失的 Confluence / 条件文件被创建；重名、空分组、重复 Confluence 被拒绝。
- C2 `updatePlaybook`：整体替换条件；改 description。
- C3 `setPlaybook` / `removePlaybook`；`listPositions({ playbook })` 能查到。
- C4 `createTemplate`，并在 `createPosition({ template })` 中使用。
- C5 `updateSymbol`：fee_value / type / contract_unit；同名标的跨账户时要求指定 account。
- C6 `renameEntry`：第一次只返回范围和 token；错误 token 被拒绝；确认后文件改名，仓位和策略手册里的链接全部更新。
- C7 `deleteEntry`：上下文条目（仓位里的引用被清掉）、仓位、账户（连带标的、仓位、平台）；都先预览后确认；只进回收站。
- C8 平台不能直接删（删除使用它的账户时，无人使用的平台随之删除）；条件文件被策略手册引用时不能删，无人引用时可以先预览后确认删除。

## D 组：人机共管与安全

- D1 `describe()`：列出的操作与 api 上的方法一一对应；逐条用它给的 example 形状调用（破坏性操作只做预览）。
- D2 `listAgentActivity`：每次写操作都有记录，created / modified 准确。
- D3 `undo`：按 id 撤销修改和新建；人工编辑后撤销返回 `CONFLICT` 且不覆盖人工内容；改名、删除不可撤销。
- D4 `checkHealth`：模拟人工改坏 `lucr_type`、加一个指向不存在条目的二级标题、放一张没人引用的图片，三类问题都被报出，修复建议可执行。
- D5 对抗性输入：路径穿越（`../`）、库外路径、超长文本、Unicode 与特殊字符名称（`/ : # [ ]`）、base64 JSON 传参。
- D6 并发：两个调用同时 `createPosition`，不产生重复编号或互相覆盖。
