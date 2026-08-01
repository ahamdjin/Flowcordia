type FlowcordiaFlagValue = boolean | number | string | readonly unknown[] | Record<string, unknown>;
type FlowcordiaFlagsMap = Readonly<Record<string, FlowcordiaFlagValue>>;

const publicUrl =
  typeof window === "undefined" ? "http://localhost/" : `${window.location.origin}/`;

const flowcordiaTheme = Object.freeze({
  websiteName: "Flowcordia",
  logos: {
    fullLogoUrl: "",
    favIconUrl: "",
    logoIconUrl: "",
  },
  colors: {
    avatar: "#111827",
    "blue-link": "#2563eb",
    danger: "#dc2626",
    selection: "#dbeafe",
    primary: {
      default: "#111827",
      dark: "#030712",
      light: "#f3f4f6",
      medium: "#6b7280",
    },
    warn: {
      default: "#d97706",
      light: "#fef3c7",
      dark: "#92400e",
    },
    success: {
      default: "#059669",
      light: "#d1fae5",
    },
  },
});

/**
 * Activepieces normally suspends the builder while it loads platform flags from
 * `/api/v1/flags`. Flowcordia embeds only the builder surface and owns its
 * runtime, permissions and configuration, so these values are deliberately
 * local and synchronous.
 */
export const FLOWCORDIA_ACTIVEPIECES_FLAGS: FlowcordiaFlagsMap = Object.freeze({
  CURRENT_VERSION: "flowcordia-studio-v2",
  EDITION: "ce",
  ENVIRONMENT: "dev",
  PUBLIC_URL: publicUrl,
  WEBHOOK_URL_PREFIX: `${publicUrl.replace(/\/$/, "")}/api/v1/webhooks`,
  FLOW_RUN_MEMORY_LIMIT_KB: 256 * 1024,
  FLOW_RUN_LOG_SIZE_LIMIT_MB: 10,
  FLOW_RUN_TIME_SECONDS: 600,
  TRIGGER_TIMEOUT_SECONDS: 60,
  PAUSED_FLOW_TIMEOUT_DAYS: 30,
  WEBHOOK_TIMEOUT_SECONDS: 30,
  ALLOW_NPM_PACKAGES_IN_CODE_STEP: true,
  CLOUD_AUTH_ENABLED: false,
  EMAIL_AUTH_ENABLED: false,
  PRIVATE_PIECES_ENABLED: false,
  SHOW_COMMUNITY: false,
  SHOW_POWERED_BY_IN_FORM: false,
  SHOW_ALERTS: false,
  SHOW_PROJECT_MEMBERS: false,
  TELEMETRY_ENABLED: false,
  TOOL_SEARCH_ENABLED: false,
  AGENTS_CONFIGURED: false,
  SMTP_CONFIGURED: false,
  PGVECTOR_AVAILABLE: false,
  SUPPORTED_APP_WEBHOOKS: [],
  TEMPLATES_CATEGORIES: [],
  THEME: flowcordiaTheme,
});

function flagValue<T>(flagId: string): T | null {
  if (!Object.prototype.hasOwnProperty.call(FLOWCORDIA_ACTIVEPIECES_FLAGS, flagId)) {
    return null;
  }
  return FLOWCORDIA_ACTIVEPIECES_FLAGS[flagId] as T;
}

export const flagsHooks = {
  queryKey: ["flags"] as const,
  useFlags: () => ({
    data: FLOWCORDIA_ACTIVEPIECES_FLAGS,
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    isPending: false,
    isSuccess: true,
  }),
  useWebsiteBranding: () => flowcordiaTheme,
  useFlag: <T>(flagId: string) => ({ data: flagValue<T>(flagId) }),
};
