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
    avatar: "#111111",
    "blue-link": "#171717",
    danger: "#dc2626",
    selection: "#e5e5e5",
    primary: {
      default: "#0a0a0a",
      dark: "#000000",
      light: "#f5f5f5",
      medium: "#737373",
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
 * Backend data returned to Activepieces' own flagsApi/flagsHooks through
 * `/v1/flags`. This file intentionally contains no React hooks or UI behavior.
 */
export const FLOWCORDIA_ACTIVEPIECES_FLAGS: FlowcordiaFlagsMap = Object.freeze({
  CURRENT_VERSION: "0.86.3",
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
