// LucrView Protocol Types
// Shared between LucrView (iframe) and host (LucrTrade).

// ─── Data Types ──────────────────────────────────────────────────────────────

// https://www.tradingview.com/charting-library-docs/latest/ui_elements/Resolution/#resolution-format
interface Bar {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume?: number;
}

/** Resolution-independent viewport: resolution + bar count + right edge */
interface Timeframe {
	/** Resolution (e.g., "1", "15", "60", "D") */
	resolution: string;
	/** Right edge timestamp (Unix seconds) */
	right_edge_time: number;

	left_edge_time: number;
}

/**
 * Minimal persisted chart state.
 * Only stores essential fields instead of TradingView's full state.
 * On load, we merge these into a fresh full state from the widget.
 */
export interface MinimalChartState {
	/** Chart type: 1=Bars, 2=Candles, 3=Line, 8=HeikinAshi, 9=HollowCandles, 10=Baseline, 12=Area */
	chartType?: number;
	/** Price scale mode */
	priceScale?: 'log' | 'percentage' | 'regular';
	/** Drawings (Map<EntityId, LineToolState> serialized as plain object) */
	sources?: Record<string, unknown>;
	/** Drawing groups (Map<string, LineToolsGroupState> serialized as plain object) */
	groups?: Record<string, unknown>;
	/** Symbol associated with drawings */
	symbol?: string;
	/** Viewport state */
	timeframe?: Timeframe;
}

/** Customizable theme colors. All fields have built-in light/dark defaults. */
export interface ThemeColors {
	/** Buy / long color (default: "#26a69a") */
	buyColor: string;
	/** Sell / short color (default: "#ef5350") */
	sellColor: string;
	/** Darker buy variant for size badges (default: "#1b7a70") */
	buyColorDark: string;
	/** Darker sell variant for size badges (default: "#c62828") */
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

	/** Header button icon color (light default: "#131722", dark default: "#d1d4dc") */
	headerIconColor: string;

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
	theme?: 'light' | 'dark';
	timezone?: string;
	locale?: string;
	autosize?: boolean;
	kind: 'symbol' | 'position';
	savedState?: MinimalChartState | undefined;
	marks?: ChartMark[];
	/** Max bars to show when switching resolution. Prevents huge countBack values. */
	maxBarsOnSwitch: number;
	/** Color overrides for light/dark themes, derived from Obsidian theme. */
	colors: {
		light: ThemeColors;
		dark: ThemeColors;
	};
	/** Optional snapshot image. */
	snapshot?: string | undefined;
}

/** Bar mark returned by the host for getMarks datafeed callback */
interface ChartMark {
	/** ID of the mark */
	id: string;
	/**
   * Time for the mark.
   * Unix timestamp in seconds.
   */
	time: number;
	/** Color for the mark */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	color: any;
	/** Text content for the mark */
	text: string;
	/** Label for the mark */
	label: string;
	/** Text color for the mark */
	labelFontColor: string;
	/** Minimum size for the mark */
	minSize: number;
	/** Border Width */
	borderWidth?: number;
	/** Border Width when hovering over bar mark */
	hoveredBorderWidth?: number;
	/**
   * Optional URL for an image to be displayed within the timescale mark.
   *
   * The image should ideally be square in dimension. You can use any image type which
   * the browser supports natively.
   *
   * Examples:
   * - `https://yourserver.com/adobe.svg`
   * - `/images/myImage.png`
   * - `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3...`
   * - `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4...`
   */
	imageUrl?: string;
	/**
   * Continue to show text label even when an image has
   * been loaded for the timescale mark.
   *
   * Defaults to `false` if undefined.
   */
	showLabelWhenImageLoaded?: boolean;
}

// ─── Inbound Messages (Host → LucrView) ─────────────────────────────────────

interface InitWidgetMessage {
	type: 'INIT_WIDGET';
	payload: ChartConfig;
}

interface ReceiveHistoryMessage {
	type: 'RECEIVE_HISTORY';
	payload: {
		reqId: string;
		bars: Bar[];
		noData: boolean;
		error?: string;
	};
}

interface ReceiveTickMessage {
	type: 'RECEIVE_TICK';
	payload: Bar;
}

interface LoadStateMessage {
	type: 'LOAD_STATE';
	payload: MinimalChartState;
}

interface RefreshMarksMessage {
	type: 'REFRESH_MARKS';
	payload: { marks: ChartMark[] };
}

interface UpdateSettingsMessage {
	type: 'UPDATE_SETTINGS';
	payload: {
		theme?: 'light' | 'dark';
		locale?: string;
		timezone?: string;
		snapshot?: string | undefined;
		colors?: ThemeColors;
	};
}

interface SaveChartMessage {
	type: 'SAVE_CHART';
	payload: Record<string, never>;
}

export type InboundMessage =
  | InitWidgetMessage
  | ReceiveHistoryMessage
  | ReceiveTickMessage
  | LoadStateMessage
  | RefreshMarksMessage
  | UpdateSettingsMessage
  | SaveChartMessage

// ─── Outbound Messages (LucrView → Host) ────────────────────────────────────

interface BridgeReadyMessage {
	type: 'BRIDGE_READY';
	payload: Record<string, never>;
}

interface WidgetReadyMessage {
	type: 'WIDGET_READY';
	payload: Record<string, never>;
}

interface ReqHistoryMessage {
	type: 'REQ_HISTORY';
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

interface ReqSubscribeMessage {
	type: 'REQ_SUBSCRIBE';
	payload: {
		symbol: string;
		resolution: string;
		uid: string;
	};
}

interface ReqUnsubscribeMessage {
	type: 'REQ_UNSUBSCRIBE';
	payload: {
		uid: string;
	};
}

interface SaveStateMessage {
	type: 'SAVE_STATE';
	payload: MinimalChartState;
}

interface OnMarkClickMessage {
	type: 'ON_MARK_CLICK';
	payload: Pick<ChartMark, 'id'>;
}

export type OutboundMessage =
  | BridgeReadyMessage
  | WidgetReadyMessage
  | ReqHistoryMessage
  | ReqSubscribeMessage
  | ReqUnsubscribeMessage
  | SaveStateMessage
  | OnMarkClickMessage
  | { type: 'SAVE_SNAPSHOT'; payload: { base64: string } }
  | { type: 'DELETE_SNAPSHOT'; payload: Record<string, never> }
  | { type: 'RESET_VIEW'; payload: Record<string, never> }
