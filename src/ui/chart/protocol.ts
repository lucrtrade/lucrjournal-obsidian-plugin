// LucrView Protocol Types
// Shared between LucrView (iframe) and host (LucrTrade).

// ─── Data Types ──────────────────────────────────────────────────────────────

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** Resolution-independent viewport: resolution + bar count + right edge */
export interface Timeframe {
  /** Resolution (e.g., "1", "15", "60", "D") */
  resolution: string;
  /** Right edge timestamp (Unix seconds) */
  right_edge_time: number;

  left_edge_time: number;
}

/** A position fill: execution time (Unix seconds) and optional price. */
export interface PositionFill {
  /** Execution time. Unix timestamp in seconds. */
  time: number;
  /** Execution price, if known. */
  price?: number;
}

/**
 * Minimal persisted chart state.
 * Only stores essential fields instead of TradingView's full state.
 * On load, we merge these into a fresh full state from the widget.
 */
export interface MinimalChartState {
  /** Chart type: 1=Bars, 2=Candles, 3=Line, 8=HeikinAshi, 9=HollowCandles, 10=Baseline, 12=Area */
  chartType?: number;
  /** Drawings (Map<EntityId, LineToolState> serialized as plain object) */
  sources?: Record<string, unknown>;
  /** Drawing groups (Map<string, LineToolsGroupState> serialized as plain object) */
  groups?: Record<string, unknown>;
  /** Symbol associated with drawings */
  symbol?: string;
  /** Viewport state */
  timeframe?: Timeframe;
}

/** Customizable theme colors. All fields have built-in defaults. */
export interface ThemeColors {
  /** Buy / long color (default: "#26a69a") */
  buyColor: string;
  /** Sell / short color (default: "#ef5350") */
  sellColor: string;
  /** Darker buy variant for quantity badges (default: "#1b7a70") */
  buyColorDark: string;
  /** Darker sell variant for quantity badges (default: "#c62828") */
  sellColorDark: string;
  /** Text rendered on top of colored backgrounds (default: "#ffffff") */
  textOnColor: string;
  /** Chart background color (light default: "#ffffff", dark default: "#131722") */
  backgroundColor: string;

  /** Loading screen progress bar color (default: "#2962FF") */
  loadingFg: string;

  /** Pane separator color (default: "rgba(0, 0, 0, 0)") */
  separatorColor: string;
  /** Crosshair line color (default: "rgba(0, 0, 0, 0)") */
  crosshairColor: string;
  /** Symbol watermark transparency 0-100 (default: 90) */
  watermarkTransparency: number;

  // ─── New Fields from Settings Migration ───
  /** Candle Up Border Color */
  buyBorderColor: string;
  /** Candle Down Border Color */
  sellBorderColor: string;
  /** Candle Up Wick Color */
  buyWickColor: string;
  /** Candle Down Wick Color */
  sellWickColor: string;
  /** Grid Line Color */
  gridColor: string;
  /** Scales Text Color */
  scalesTextColor: string;
  /** Scales Axis Line Color */
  scalesLineColor: string;

  /** Volume Up Color */
  volumeUpColor: string;
  /** Volume Down Color */
  volumeDownColor: string;
}

export interface ChartConfig {
  symbol: string;
  debug: boolean | undefined;
  exchange: string;
  timeframe: Timeframe;
  supportedResolutions?: string[];
  theme?: "light" | "dark";
  timezone?: string;
  locale?: string;
  autosize?: boolean;
  /** Position entry fill, if any. */
  entry?: PositionFill;
  /** Position exit fill, if any. Present ⇒ closed ⇒ strict historical range. */
  exit?: PositionFill;
  savedState?: MinimalChartState | undefined;
  /** Per-theme color overrides; unset fields fall back to bridge defaults. */
  colors?: {
    light?: Partial<ThemeColors>;
    dark?: Partial<ThemeColors>;
  };
}

export interface ChartMarkColor {
  border: string;
  background: string;
}

/** Bar mark returned by the host for getMarks datafeed callback */
export interface ChartMark {
  /** ID of the mark */
  id: string;
  /**
   * Time for the mark.
   * Unix timestamp in seconds.
   */
  time: number;
  /** Color for the mark */
  color: ChartMarkColor;
  /** Text content for the mark */
  text: string;
  /** Label for the mark */
  label: string;
  /** Text color for the mark */
  labelFontColor: string;
  /** Minimum size for the mark */
  minSize: number;
}

// ─── Inbound Messages (Host → LucrView) ─────────────────────────────────────

export interface InitWidgetMessage {
  type: "INIT_WIDGET";
  payload: ChartConfig;
}

export interface ReceiveHistoryMessage {
  type: "RECEIVE_HISTORY";
  payload: {
    reqId: string;
    bars: Bar[];
    noData: boolean;
    error?: string;
  };
}

export interface ReceiveTickMessage {
  type: "RECEIVE_TICK";
  payload: Bar;
}

export interface LoadStateMessage {
  type: "LOAD_STATE";
  payload: MinimalChartState;
}

export interface UpdateSettingsMessage {
  type: "UPDATE_SETTINGS";
  payload: {
    theme?: "light" | "dark";
    locale?: string;
    timezone?: string;
    colors?: Partial<ThemeColors>;
  };
}

export interface SaveChartMessage {
  type: "SAVE_CHART";
  payload: Record<string, never>;
}

export type InboundMessage =
  | InitWidgetMessage
  | ReceiveHistoryMessage
  | ReceiveTickMessage
  | LoadStateMessage
  | UpdateSettingsMessage
  | SaveChartMessage;

// ─── Outbound Messages (LucrView → Host) ────────────────────────────────────

export interface BridgeReadyMessage {
  type: "BRIDGE_READY";
  payload: Record<string, never>;
}

export interface WidgetReadyMessage {
  type: "WIDGET_READY";
  payload: Record<string, never>;
}

export interface ReqHistoryMessage {
  type: "REQ_HISTORY";
  payload: {
    symbol: string;
    resolution: string;
    from: number;
    to: number;
    firstDataRequest: boolean;
    countBack?: number;
    reqId: string;
  };
}

export interface ReqSubscribeMessage {
  type: "REQ_SUBSCRIBE";
  payload: {
    symbol: string;
    resolution: string;
    uid: string;
  };
}

export interface ReqUnsubscribeMessage {
  type: "REQ_UNSUBSCRIBE";
  payload: {
    uid: string;
  };
}

export interface SaveStateMessage {
  type: "SAVE_STATE";
  payload: MinimalChartState;
}

export interface OnMarkClickMessage {
  type: "ON_MARK_CLICK";
  payload: Pick<ChartMark, "id">;
}

export type OutboundMessage =
  | BridgeReadyMessage
  | WidgetReadyMessage
  | ReqHistoryMessage
  | ReqSubscribeMessage
  | ReqUnsubscribeMessage
  | SaveStateMessage
  | OnMarkClickMessage
  | { type: "SAVE_SNAPSHOT"; payload: { base64: string } }
  | { type: "RESET_VIEW"; payload: Record<string, never> };
