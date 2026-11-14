# Agent API 与 Skill 待办清单

## 已解决

### Agent API（第二轮实测，已提交 f13583e）

- [x] 确认 token 改为一次性随机 token，并比对完整预览范围（原 32 位哈希可被碰撞，用 A 的 token 删掉 B）
- [x] 删除中途失败时恢复已去掉链接的仓位；改名中途失败时把文件移回原处；无法恢复的文件报 `ROLLBACK_FAILED`
- [x] `undo` 不再删除已被其他笔记链接的新建条目
- [x] 写入后等 Obsidian 索引到磁盘上的最新版本才返回（修复 `createEntry` 后立刻 `updateEntry` 找不到）
- [x] `linkContext` 识别 `名称.md` 和库内路径，不再新建以路径为标题的条目
- [x] `unlinkContext` 删除重复链接的全部标题
- [x] `saveAttachment` 支持 `dryRun`
- [x] 按完整路径移除附件时不误删其他文件夹的同名附件；只给文件名且不唯一时报 `ENTRY_AMBIGUOUS`
- [x] 删除预览不再把会被清理干净的仓位列进 `linksLeftBroken`
- [x] 条目名支持 `[[名称|别名]]`
- [x] `undo` 判断用户改动时，正文里以 `modified:` 开头的行不再被忽略
- [x] `describe()` 补充 `side` 的 buy/sell、附件 `{ sourcePath }`、`public: null` 的说明
- [x] 测试文档 C8 与条件文件删除规则一致

### Agent API（Skill 实测中发现，未提交）

- [x] 撤销时如果后续操作是不可撤销的删除/改名，提示改为"往前改"，不再让 agent 去撤销删除
- [x] `createPosition` 返回的打开命令：系统打不开 `obsidian://` 链接时，后面的打开与验证仍会执行

### Skill 测试循环中修复（未提交，见 `dev/agent-skill-test-plan.md`）

- [x] `saveAttachment` 经脚本调用必定失败（base64 输入被当成文件路径）
- [x] 并发调用时 Obsidian CLI 混入其他调用的日志行，成功调用被误判为退出码 2
- [x] 所有删除预览都带 `linksLeftBroken`
- [x] JSON 写错时报 "malformed JSON" 并给出位置（原来误报为 base64 错误），`createPosition` 同样
- [x] `METADATA_TIMEOUT` 的 `keptPaths` 只列实际写入的文件
- [x] `describe()` 补全约束：价格与数量为正数、手数步长 0.01、合约数 1–20、时区偏移可省略、超时保留文件、新闻抓取可能失败
- [x] 撤销冲突的 `error.fix` 与 skill 一致（只改了字段时可用最新 `rev` 往前改）
- [x] `lucr.sh` / `lucr.ps1`：多余参数、空 `--vault`、输入路径为目录或不可读时都返回退出码 2，不再继续执行
- [x] skill 规则：「这笔」指本次对话里的仓位；永续补 `.P`；方向推断不出要先问；不编造数量和新闻来源；改名和删除不可撤销；活动记录含其他 agent 的操作；单次调用约 20 KB UTF-8 上限

### Skill（未提交）

- [x] 新建单一 skill `skills/lucrjournal/`，取代 `lucrjournal-create-position`
- [x] 主文件：规则、调用方式、读结果、按需求索引参考文件；字段以 `describe` 为准，不抄字段表
- [x] 4 个参考文件：仓位、上下文条目、策略手册与清理、撤销与排错
- [x] 调用脚本 `lucr.sh` / `lucr.ps1`：base64 传输输入，退出码区分成功 / 业务报错 / 未连上 Obsidian
- [x] `lucr.sh` 的 `--vault` 可写在任意位置
- [x] 图片一律传文件路径，避开命令行长度限制
- [x] 匹配规则：先查已有条目；语义相近但无描述的条目视为不确定，先问用户
- [x] "今天的条目"：先按创建日期收集，再筛掉无关条目，展示名单确认后才关联
- [x] 撤销冲突、重新打开仓位后备注仍保留等情况的处理说明
- [x] `lucr.ps1` 输出改为 UTF-8，PowerShell 示例改为 `-ExecutionPolicy Bypass -File` 加文件传参
- [x] README 中英文新增"用 AI agent 操作"一节

## 待办

### Windows（需要真机）

- [ ] Windows PowerShell 5.1 跑通 `lucr.ps1`：`describe`、中文与引号的写入读出、`ok:false` 时退出码为 1
- [ ] PowerShell 7（`pwsh`）同样跑一遍
- [ ] 执行 `createPosition` 返回的 `data.open.powershell`，确认能打开仓位
- [ ] Git Bash 跑通 `lucr.sh`
- [ ] Windows 下 Obsidian CLI 命令名、PATH 是否与文档一致

### 发布前

- [ ] 实测 README 里的安装命令 `npx skills add lucrtrade/lucrjournal-obsidian-plugin`
- [ ] 更新 PR 描述（测试数、第二轮修复、新 skill）并推送
- [ ] skill 要求 agent API v2：发布包含 v2 的插件版本后，用户才能使用

### 需要你决定

- [ ] 多单把止损移到入场价之上（保本 / 锁利）目前被 `RISK_DIRECTION` 拒绝。是否允许已开仓位这样改？现在 skill 让 agent 告诉用户不支持，并把新止损记进备注

### 之后再做

- [ ] 新增只读 `getEntry`，返回条目的属性和正文（目前 `listEntries` 不返回正文，agent 改完条目后无法核对）
- [ ] `listEntries` 增加按日期筛选、按时间排序和翻页（目前"今天的条目"靠 agent 自己按 `created` 筛，超过 500 条会漏）
- [ ] 插件设置里加"连接 AI agent"按钮。目标流程：用户装插件 → 点按钮 → 在库文件夹里打开 Claude Code / Codex，说"给我创建一个仓位"，agent 就先加载 `lucrjournal` skill 再操作
  - 把 `skills/lucrjournal` 写进库里的 `.claude/skills/lucrjournal`（Claude Code）和 `.agents/skills/lucrjournal`（Codex）。社区插件安装时只下载 `main.js`、`manifest.json`、`styles.css`，所以 skill 文件要在构建时打包进插件
  - 在库根目录生成 `AGENTS.md`（Codex 读）和 `CLAUDE.md`（Claude Code 读，只写一行 `@AGENTS.md`）。内容：涉及仓位、新闻、关键位、confluence、市场分析、策略手册或 `LucrJournal/` 的请求，先加载 `lucrjournal` skill；不直接创建、修改、移动、改名或删除 `LucrJournal/` 下的文件；skill 不可用时告诉用户，不要改用手改文件
  - 库里已有 `AGENTS.md` / `CLAUDE.md` 时不覆盖用户内容，只追加 LucrJournal 这一段
  - 插件更新后 skill 跟着更新，保证 skill 和 agent API 版本一致
  - 检查 Obsidian 命令行功能（Settings → General → Command line interface）是否已打开，没开就提醒用户
  - 现在 `lucrjournal_local_test` 里的 skill 是指向本仓库的软链接（手动装的，用于测试）；按钮做好后删掉软链接，用按钮装一次实测，并确认 agent 在只说"给我创建一个仓位"时会先加载 skill
- [ ] MCP 接入，支持没有命令行的 agent（Claude 桌面版、ChatGPT 等）
- [ ] 删除策略手册时，其条件文件不会一起删除，需要单独清理
- [ ] 改名预览依赖 Obsidian 索引：外部程序刚写入文件就确认改名时，预览可能少列引用文件（已知限制）
