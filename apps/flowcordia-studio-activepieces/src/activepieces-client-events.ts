// Open protocol types used by the MIT Activepieces builder when it runs in an iframe.
// This module deliberately excludes Activepieces' enterprise embedding implementation.
export const ActivepiecesClientEventName = {
  CLIENT_INIT: "CLIENT_INIT",
  CLIENT_ROUTE_CHANGED: "CLIENT_ROUTE_CHANGED",
  CLIENT_NEW_CONNECTION_DIALOG_CLOSED: "CLIENT_NEW_CONNECTION_DIALOG_CLOSED",
  CLIENT_SHOW_CONNECTION_IFRAME: "CLIENT_SHOW_CONNECTION_IFRAME",
  CLIENT_CONNECTION_NAME_IS_INVALID: "CLIENT_CONNECTION_NAME_IS_INVALID",
  CLIENT_AUTHENTICATION_SUCCESS: "CLIENT_AUTHENTICATION_SUCCESS",
  CLIENT_AUTHENTICATION_FAILED: "CLIENT_AUTHENTICATION_FAILED",
  CLIENT_CONFIGURATION_FINISHED: "CLIENT_CONFIGURATION_FINISHED",
  CLIENT_CONNECTION_PIECE_NOT_FOUND: "CLIENT_CONNECTION_PIECE_NOT_FOUND",
  CLIENT_BUILDER_HOME_BUTTON_CLICKED: "CLIENT_BUILDER_HOME_BUTTON_CLICKED",
  CLIENT_SHOW_MCP_IFRAME: "CLIENT_SHOW_MCP_IFRAME",
  CLIENT_MCP_SETTINGS_DIALOG_CLOSED: "CLIENT_MCP_SETTINGS_DIALOG_CLOSED",
  CLIENT_MCP_OAUTH_APPROVED: "CLIENT_MCP_OAUTH_APPROVED",
  CLIENT_MCP_OAUTH_DENIED: "CLIENT_MCP_OAUTH_DENIED",
} as const;

export const ActivepiecesVendorEventName = {
  VENDOR_INIT: "VENDOR_INIT",
  VENDOR_ROUTE_CHANGED: "VENDOR_ROUTE_CHANGED",
} as const;

export const NEW_CONNECTION_QUERY_PARAMS = {
  name: "pieceName",
  connectionName: "connectionName",
  randomId: "randomId",
} as const;

export interface ActivepiecesClientInit {
  type: typeof ActivepiecesClientEventName.CLIENT_INIT;
  data: Record<string, never>;
}

export interface ActivepiecesClientAuthenticationSuccess {
  type: typeof ActivepiecesClientEventName.CLIENT_AUTHENTICATION_SUCCESS;
  data: Record<string, never>;
}

export interface ActivepiecesClientAuthenticationFailed {
  type: typeof ActivepiecesClientEventName.CLIENT_AUTHENTICATION_FAILED;
  data: unknown;
}

export interface ActivepiecesClientConfigurationFinished {
  type: typeof ActivepiecesClientEventName.CLIENT_CONFIGURATION_FINISHED;
  data: Record<string, never>;
}

export interface ActivepiecesClientShowConnectionIframe {
  type: typeof ActivepiecesClientEventName.CLIENT_SHOW_CONNECTION_IFRAME;
  data: Record<string, never>;
}

export interface ActivepiecesClientConnectionNameIsInvalid {
  type: typeof ActivepiecesClientEventName.CLIENT_CONNECTION_NAME_IS_INVALID;
  data: { error: string };
}

export interface ActivepiecesClientConnectionPieceNotFound {
  type: typeof ActivepiecesClientEventName.CLIENT_CONNECTION_PIECE_NOT_FOUND;
  data: { error: string };
}

export interface ActivepiecesClientRouteChanged {
  type: typeof ActivepiecesClientEventName.CLIENT_ROUTE_CHANGED;
  data: { route: string };
}

export interface ActivepiecesNewConnectionDialogClosed {
  type: typeof ActivepiecesClientEventName.CLIENT_NEW_CONNECTION_DIALOG_CLOSED;
  data: { connection?: { id: string; name: string } };
}

export interface ActivepiecesClientShowMcpIframe {
  type: typeof ActivepiecesClientEventName.CLIENT_SHOW_MCP_IFRAME;
  data: Record<string, never>;
}

export interface ActivepiecesClientMcpSettingsDialogClosed {
  type: typeof ActivepiecesClientEventName.CLIENT_MCP_SETTINGS_DIALOG_CLOSED;
  data: Record<string, never>;
}

export interface ActivepiecesClientMcpOAuthApproved {
  type: typeof ActivepiecesClientEventName.CLIENT_MCP_OAUTH_APPROVED;
  data: { redirectUrl: string };
}

export interface ActivepiecesClientMcpOAuthDenied {
  type: typeof ActivepiecesClientEventName.CLIENT_MCP_OAUTH_DENIED;
  data: Record<string, never>;
}

export interface ActivepiecesVendorRouteChanged {
  type: typeof ActivepiecesVendorEventName.VENDOR_ROUTE_CHANGED;
  data: { vendorRoute: string };
}

export interface ActivepiecesVendorInit {
  type: typeof ActivepiecesVendorEventName.VENDOR_INIT;
  data: {
    hideSidebar: boolean;
    hideFlowNameInBuilder?: boolean;
    disableNavigationInBuilder: boolean | "keep_home_button_only";
    hideFolders?: boolean;
    hideTables?: boolean;
    sdkVersion?: string;
    jwtToken: string;
    initialRoute?: string;
    fontUrl?: string;
    fontFamily?: string;
    hideExportAndImportFlow?: boolean;
    hideDuplicateFlow?: boolean;
    homeButtonIcon?: "back" | "logo";
    emitHomeButtonClickedEvent?: boolean;
    locale?: string;
    mode?: "light" | "dark";
    hideFlowsPageNavbar?: boolean;
    hidePageHeader?: boolean;
    hideActiveUsers?: boolean;
    hideGlobalSearch?: boolean;
  };
}
