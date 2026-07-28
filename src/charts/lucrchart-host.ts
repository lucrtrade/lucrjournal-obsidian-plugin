export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type Timeframe = {
  resolution: string;
  right_edge_time: number;
  left_edge_time: number;
};

export type PositionFill = {
  time: number;
  side: "buy" | "sell";
  price?: number;
};

export type MinimalChartState = {
  chartType?: number;
  sources?: Record<string, unknown>;
  groups?: Record<string, unknown>;
  symbol?: string;
  timeframe?: Timeframe;
};

export type ThemeColors = {
  buyColor: string;
  sellColor: string;
  buyColorDark: string;
  sellColorDark: string;
  textOnColor: string;
  backgroundColor: string;
  loadingFg: string;
  separatorColor: string;
  crosshairColor: string;
  watermarkTransparency: number;
  buyBorderColor: string;
  sellBorderColor: string;
  buyWickColor: string;
  sellWickColor: string;
  gridColor: string;
  scalesTextColor: string;
  scalesLineColor: string;
  volumeUpColor: string;
  volumeDownColor: string;
};

export type ChartConfig = {
  symbol: string;
  symbolType: "crypto" | "futures" | "cfd";
  debug: boolean | undefined;
  exchange: string;
  maxBarsPerRequest: number;
  resolution?: string;
  supportedResolutions?: readonly string[];
  theme?: "light" | "dark";
  timezone?: string;
  locale?: string;
  autosize?: boolean;
  entry?: PositionFill;
  exit?: PositionFill;
  savedState?: MinimalChartState | undefined;
  colors?: {
    light?: Partial<ThemeColors>;
    dark?: Partial<ThemeColors>;
  };
};

type ChartSettings = {
  theme: "light" | "dark";
  locale?: string;
  timezone?: string;
  colors: Partial<ThemeColors>;
};

type HistoryRequest = {
  symbol: string;
  resolution: string;
  from: number;
  to: number;
  firstDataRequest: boolean;
  countBack?: number;
  reqId: string;
};

type ChartMarkColor = {
  border: string;
  background: string;
};

export type ChartMark = {
  id: string;
  time: number;
  color: ChartMarkColor;
  text: string;
  label: string;
  labelFontColor: string;
  minSize: number;
};

// @story [[chart/host-protocol#^messages-are-exhaustive]] Enumerates every inbound message type.
// @story [[chart/host-protocol#^message-has-type-and-payload]] Gives every message a type tag and payload.
export type InboundMessage =
  | {
      type: "INIT_WIDGET";
      payload: ChartConfig;
    }
  | {
      type: "RECEIVE_HISTORY";
      payload: { reqId: string; bars: Bar[]; noData: boolean; error?: string };
    }
  | {
      type: "RECEIVE_TICK";
      payload: Bar;
    }
  | {
      type: "LOAD_STATE";
      payload: MinimalChartState;
    }
  | {
      type: "UPDATE_SETTINGS";
      payload: {
        theme?: "light" | "dark";
        locale?: string;
        timezone?: string;
        colors?: Partial<ThemeColors>;
      };
    }
  | {
      type: "SAVE_CHART";
      payload: Record<string, never>;
    };

export type OutboundMessage =
  | { type: "BRIDGE_READY"; payload: Record<string, never> }
  | { type: "WIDGET_READY"; payload: Record<string, never> }
  | { type: "REQ_HISTORY"; payload: HistoryRequest }
  | {
      type: "REQ_SUBSCRIBE";
      payload: { symbol: string; resolution: string; uid: string };
    }
  | { type: "REQ_UNSUBSCRIBE"; payload: { uid: string } }
  | { type: "SAVE_STATE"; payload: MinimalChartState }
  | { type: "SAVE_SNAPSHOT"; payload: { base64: string } };

type RenderOptions = {
  frame: HTMLIFrameElement;
  src: string;
  origin: string;
  buildConfig: () => ChartConfig | null;
  readSettings: () => ChartSettings;
  readState?: () => MinimalChartState | undefined;
  writeState?: (state: MinimalChartState) => unknown;
  writeScreenshot?: (base64: string) => unknown;
  fetchHistory: (request: HistoryRequest) => Promise<Bar[]>;
  onReady?: (value: boolean) => void;
  onAvailable?: (value: boolean) => void;
  onError?: (error: unknown) => void;
};

type RenderResult = {
  update: (options: RenderOptions) => void;
  refresh: () => void;
  cleanup: () => void;
};

const configIdentity = (config: ChartConfig) =>
  stableJson({
    symbol: config.symbol,
    symbolType: config.symbolType,
    exchange: config.exchange,
    entry: config.entry,
    exit: config.exit,
    resolution: config.resolution,
    supportedResolutions: config.supportedResolutions,
    maxBarsPerRequest: config.maxBarsPerRequest,
    debug: config.debug,
    autosize: config.autosize,
  });

const settingsIdentity = (settings: ChartSettings) =>
  stableJson({
    theme: settings.theme,
    locale: settings.locale,
    timezone: settings.timezone,
    colors: settings.colors,
  });

const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
};

const sanitizeState = (
  state: MinimalChartState | undefined,
  config: ChartConfig,
) => (state?.symbol === config.symbol ? state : undefined);

export function render(options: RenderOptions): RenderResult {
  let current = options;
  let bridgeReady = false;
  let cleaned = false;
  let generation = 0;
  let lastConfigIdentity = "";
  let lastSettingsIdentity = "";
  const win = current.frame.ownerDocument.defaultView;

  if (!win) throw new Error("Missing frame.ownerDocument.defaultView");

  // @story [[chart/host-protocol#^detached-host-stops-posting]] Stops posting once cleaned up or detached.
  // @story [[chart/host-protocol#^post-targets-explicit-origin]] Posts to an explicit target origin.
  const post = (msg: InboundMessage) => {
    if (cleaned || !current.frame.isConnected) return;
    current.frame.contentWindow?.postMessage(msg, current.origin);
  };

  const refresh = () => {
    if (cleaned) return;
    const config = current.buildConfig();
    if (config === null) {
      current.onReady?.(false);
      current.onAvailable?.(false);
      return;
    }
    // @story [[chart/host-protocol#^no-post-before-bridge-ready]] Sends nothing before the bridge is ready.
    if (!bridgeReady) return;

    const settings = current.readSettings();
    const nextConfigIdentity = configIdentity(config);
    const nextSettingsIdentity = settingsIdentity(settings);
    // @story [[chart/host-protocol#^config-change-reinitialises]] Reinitialises the widget when the config changes.
    // @story [[chart/host-protocol#^generation-increments-on-reset]] Bumps the generation on every reinitialisation.
    if (nextConfigIdentity !== lastConfigIdentity) {
      generation += 1;
      lastConfigIdentity = nextConfigIdentity;
      lastSettingsIdentity = nextSettingsIdentity;
      post({
        type: "INIT_WIDGET",
        payload: {
          ...config,
          theme: settings.theme,
          locale: settings.locale,
          timezone: settings.timezone,
          colors: { [settings.theme]: settings.colors },
          savedState: sanitizeState(current.readState?.(), config),
        },
      });
      return;
    }
    // @story [[chart/host-protocol#^settings-change-updates-only]] Sends a settings update without reinitialising.
    if (nextSettingsIdentity !== lastSettingsIdentity) {
      lastSettingsIdentity = nextSettingsIdentity;
      post({ type: "UPDATE_SETTINGS", payload: settings });
    }
  };

  const receiveHistory = (
    request: HistoryRequest,
    bars: Bar[],
    error?: string,
  ) => {
    post({
      type: "RECEIVE_HISTORY",
      payload: {
        reqId: request.reqId,
        bars,
        noData: bars.length === 0,
        ...(error ? { error } : {}),
      },
    });
  };

  const handleHistory = async (
    request: HistoryRequest,
    requestGeneration: number,
  ) => {
    try {
      const bars = await current.fetchHistory(request);
      if (cleaned || requestGeneration !== generation) return;
      receiveHistory(request, bars);
      if (request.firstDataRequest) current.onAvailable?.(bars.length > 0);
    } catch (error) {
      if (cleaned || requestGeneration !== generation) return;
      receiveHistory(request, [], String((error as Error).message ?? error));
      if (request.firstDataRequest) current.onAvailable?.(false);
      current.onError?.(error);
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (cleaned || !current.frame.isConnected) return;
    if (
      // @story [[chart/host-protocol#^origin-and-source-verified]] Verifies both origin and source window.
      event.origin !== current.origin ||
      event.source !== current.frame.contentWindow
    )
      return;

    const msg = event.data as OutboundMessage | undefined;
    // @story [[chart/host-protocol#^untyped-message-ignored]] Ignores messages without a string type tag.
    if (!msg || typeof msg.type !== "string") return;
    // @story [[chart/host-protocol#^bridge-ready-triggers-init]] Marks the bridge ready and pushes a full config.
    if (msg.type === "BRIDGE_READY") {
      bridgeReady = true;
      refresh();
      return;
    }
    if (msg.type === "WIDGET_READY") {
      current.onReady?.(true);
      return;
    }
    if (msg.type === "SAVE_STATE") {
      current.writeState?.(msg.payload);
      return;
    }
    if (msg.type === "SAVE_SNAPSHOT") {
      current.writeScreenshot?.(msg.payload.base64);
      return;
    }
    // @story [[chart/host-protocol#^stale-generation-discarded]] Discards history responses from an older generation.
    if (msg.type === "REQ_HISTORY") void handleHistory(msg.payload, generation);
  };

  win.addEventListener("message", onMessage);
  current.frame.src = current.src;

  return {
    update: (options) => {
      const frameChanged =
        current.frame !== options.frame || current.src !== options.src;
      current = options;
      // @story [[chart/host-protocol#^frame-change-resets-identity]] Resets readiness and identities when the frame changes.
      if (frameChanged) {
        // A new frame/src reloads the iframe: the old widget is gone, so reset
        // readiness and identities to force a fresh INIT_WIDGET, and bump the
        // generation to discard history still in flight for the old frame.
        bridgeReady = false;
        generation += 1;
        lastConfigIdentity = "";
        lastSettingsIdentity = "";
        current.frame.src = current.src;
      }
    },
    refresh,
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      generation += 1;
      win.removeEventListener("message", onMessage);
    },
  };
}
