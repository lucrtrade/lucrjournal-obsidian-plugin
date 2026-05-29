# ocr.ts 拆分设计

日期：2026-05-29
范围：`src/attachments/ocr.ts`（1582 行逻辑 + 513 行 inline 测试 = 2095 行）

## 目标

降低单文件认知负担，把"职责混装"的 OCR 模块按平台/职责切成聚焦单元。**纯结构拆分，行为零改动**。

## 约束（不可妥协）

- 公共导出面与今天完全一致，消费方（`ui/attachment/attachment-ocr-review-modal.tsx`、`ui/position-details/use-position-details-media.ts`）**零改动**。
- inline 测试惯例保留：513 行测试块按职责拆开，跟到各自模块的 `import.meta.vitest` 块里。
- 不顺手"改进"逻辑、不重命名公共符号、不调整无关格式。每一行变更都能追溯到"搬运 + 改 import"。
- `let it crash` 不变：不新增 try/catch、不加 fallback。

## 形状（方案 A：文件夹 + barrel）

```
src/attachments/ocr/
  index.ts              # 公共 API barrel + 顶层编排入口
  fields.ts             # 公共类型 + 字段定义（OCR 字段 schema 的单一来源；共享叶子）
  lines.ts              # 共享文本原语：NormalizedOcrLine 类型、buildNormalizedOcrLines、通用 anchored 提取器
  metatrader.ts         # extractMetaTrader* 家族
  tradingview-text.ts   # TradingView 文本/轴价解析（scoring / axis / resolve* / direction / candidates）
  tradingview-pixels.ts # TradingView 像素 CV（overlay 检测、背景采样、像素判定）+ visual↔text 桥接
  merge.ts              # 结果合并 / draft / patch / listRecognized / resolveFirstRecognized*
```

> **`fields.ts` 为何独立（实现期发现）：** 仓库 `lint:deps`（dependency-cruiser）启用 `no-circular`。公共类型 + `POSITION_ATTACHMENT_OCR_FIELDS`（值）同时被 index 编排与 merge 函数使用；若留在 index 让 merge 反向 import，会形成 index↔merge 新循环并挂 lint。抽成共享叶子 `fields.ts`，所有模块单向依赖它，DAG 无环。

> 对齐 `src/domains/position/` 的"文件夹 + index 门面 + 同级 concern 文件"先例。

## 模块职责与边界

- **`index.ts`** — 唯一对外入口。re-export 公共符号，保持现有导出面；承载顶层编排（`getPositionAttachmentOcrFields`、`prepare/detect`、`extractPositionAttachmentOcrResultFromImageRecognition`、文本侧编排 `extractPositionAttachmentOcrResultFromRecognition`）；公共类型 `PositionAttachmentOcrResult` / `PositionAttachmentOcrDraft` 与字段定义。依赖所有 concern 模块；不含具体解析算法。
- **`lines.ts`** — 跨簇共享的文本行原语。`NormalizedOcrLine` 类型、`buildNormalizedOcrLines`，以及与平台无关的通用提取器（anchored number / 标签定位 / notional·stop·target 基础提取）。被 metatrader 与 tradingview-text 共同依赖；自身不依赖任何平台模块。
- **`metatrader.ts`** — MetaTrader mobile / history table 解析。仅依赖 `lines.ts`。
- **`tradingview-text.ts`** — TradingView 文本与坐标轴价解析全套。仅依赖 `lines.ts`。
- **`tradingview-pixels.ts`** — 纯像素计算（overlay range、背景色采样、绿/灰像素判定、背景 delta）+ `extractTradingViewVisualPriceMatch` + text↔visual 桥接 `mergePositionAttachmentOcrResultWithVisualPriceMatch`。输入 image buffer / pixel data，不依赖文本模块。
- **`merge.ts`** — 多结果合并、draft/patch 构建、recognized 值列举。只依赖公共类型。

## 唯一的架构取舍：共享文本原语归属

`NormalizedOcrLine` / `buildNormalizedOcrLines` 被三方共享。归入独立 `lines.ts`，避免：(a) 放 index 让 barrel 承载算法，或 (b) 放某一平台模块造成另一平台反向依赖。各模块从 `lines.ts` import 类型与构造器。

## 测试切分

现 1 个 `describe` / ~29 个 `it`，按归属分派到对应模块的 inline 块：

- MetaTrader 用例 → `metatrader.ts`
- TradingView 文本/轴价/qty/snap 用例 → `tradingview-text.ts`
- visual overlay / 段落聚合用例 → `tradingview-pixels.ts`
- merge / draft / patch / native amount / recognized 用例 → `merge.ts`
- 通用 anchored 文本提取用例 → `lines.ts`

## 验证（拆前拆后测试都绿）

1. 拆前：`npm run test` 全绿，记录基线（尤其 OCR 那 ~29 个用例）。
2. 每搬一个模块后：`npm run test` 仍全绿、用例数不减。
3. 收尾：`npm run lint`（含 `check-unused-code` / knip 的 unnecessary export 检查）+ `npm run build`。
4. 复核：消费方 import 路径无需改（barrel 路径 `./attachments/ocr` 不变，因为 `ocr/index.ts` 解析为同一 specifier）；公共导出符号集合不变。

## 显式不做（YAGNI）

- 不改 OCR 算法、阈值常量、正则。
- 不重命名公共导出。
- 不动 `ocr-runtime.ts` / `position-attachments.ts`。
- 不引入新依赖、新抽象层。
