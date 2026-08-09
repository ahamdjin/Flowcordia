import { createHash, randomBytes } from "node:crypto";

const REQUEST_TIMEOUT_MS = 20_000;

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

export type StudioV2ActivepiecesPieceMetadataResolver = (input: {
  pieceName: string;
  pieceVersion?: string;
}) => Promise<JsonRecord>;

export class StudioV2ActivepiecesOAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "StudioV2ActivepiecesOAuthError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string, label = key): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new StudioV2ActivepiecesOAuthError(
      "invalid_connection",
      400,
      `Activepieces OAuth ${label} is required.`
    );
  }
  return value;
}

function optionalString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function resolveValueFromProps(props: JsonRecord | undefined, value: string): string {
  let resolved = value;
  if (!props) return resolved;
  for (const [key, propValue] of Object.entries(props)) {
    resolved = resolved.replace(`{${key}}`, String(propValue));
  }
  return resolved;
}

function oauthProperty(metadata: JsonRecord): JsonRecord {
  const auth = metadata.auth;
  const candidates = Array.isArray(auth) ? auth : [auth];
  for (const candidate of candidates) {
    if (isRecord(candidate) && candidate.type === "OAUTH2") return candidate;
  }
  throw new StudioV2ActivepiecesOAuthError(
    "invalid_connection",
    400,
    "The selected Activepieces piece does not expose OAuth2 authentication."
  );
}

function requestProps(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function allowedScopes(auth: JsonRecord): string[] {
  return Array.isArray(auth.scope)
    ? auth.scope.filter((scope): scope is string => typeof scope === "string")
    : [];
}

function selectedScopes(auth: JsonRecord, requested: unknown): string[] {
  const allowed = allowedScopes(auth);
  if (requested === undefined) return allowed;
  if (!Array.isArray(requested) || requested.some((scope) => typeof scope !== "string")) {
    throw new StudioV2ActivepiecesOAuthError(
      "invalid_connection",
      400,
      "Activepieces OAuth scopes are invalid."
    );
  }
  const scopes = requested as string[];
  if (scopes.length === 0) {
    throw new StudioV2ActivepiecesOAuthError(
      "invalid_connection",
      400,
      "At least one Activepieces OAuth scope must be selected."
    );
  }
  const allowedSet = new Set(allowed);
  const invalid = scopes.filter((scope) => !allowedSet.has(scope));
  if (invalid.length > 0) {
    throw new StudioV2ActivepiecesOAuthError(
      "invalid_connection",
      400,
      `Requested Activepieces OAuth scopes are not declared by the piece: ${invalid.join(", ")}`
    );
  }
  return scopes;
}

function oauthExtra(auth: JsonRecord): JsonRecord {
  return isRecord(auth.extra) ? auth.extra : {};
}

function tokenResponseData(response: JsonRecord): JsonRecord {
  const data = { ...response };
  for (const key of ["access_token", "expires_in", "refresh_token", "scope", "token_type"]) {
    delete data[key];
  }
  return data;
}

async function readJsonResponse(response: Response): Promise<JsonRecord> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new StudioV2ActivepiecesOAuthError(
      "invalid_claim",
      502,
      "The OAuth provider returned invalid JSON."
    );
  }
  if (!isRecord(body)) {
    throw new StudioV2ActivepiecesOAuthError(
      "invalid_claim",
      502,
      "The OAuth provider returned an invalid token response."
    );
  }
  if (!response.ok) {
    const description =
      typeof body.error_description === "string"
        ? body.error_description
        : typeof body.error === "string"
          ? body.error
          : `HTTP ${response.status}`;
    throw new StudioV2ActivepiecesOAuthError(
      "invalid_claim",
      400,
      `OAuth token claim failed: ${description}`
    );
  }
  return body;
}

export function createStudioV2ActivepiecesOAuthAdapter(options: {
  getPieceMetadata: StudioV2ActivepiecesPieceMetadataResolver;
  fetchImpl?: FetchLike;
  randomBytesImpl?: typeof randomBytes;
  now?: () => number;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const randomBytesImpl = options.randomBytesImpl ?? randomBytes;
  const now = options.now ?? Date.now;

  const getAuth = async (pieceName: string, pieceVersion?: string) =>
    oauthProperty(await options.getPieceMetadata({ pieceName, pieceVersion }));

  const authorizationUrl = async (body: unknown) => {
    if (!isRecord(body)) {
      throw new StudioV2ActivepiecesOAuthError(
        "invalid_connection",
        400,
        "Activepieces OAuth authorization request is invalid."
      );
    }
    const pieceName = requiredString(body, "pieceName", "piece name");
    const pieceVersion = optionalString(body, "pieceVersion");
    const clientId = requiredString(body, "clientId", "client ID");
    const redirectUrl = requiredString(body, "redirectUrl", "redirect URL");
    const props = requestProps(body.props);
    const auth = await getAuth(pieceName, pieceVersion);
    const authUrl = resolveValueFromProps(
      props,
      requiredString(auth, "authUrl", "authorization URL")
    );
    const scopes = selectedScopes(auth, body.scopes);
    const scope = resolveValueFromProps(props, scopes.join(" "));
    const query: Record<string, string> = {
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUrl,
      access_type: "offline",
      state: randomBytesImpl(16).toString("base64url"),
      prompt: "consent",
      scope,
    };
    for (const [key, value] of Object.entries(oauthExtra(auth))) {
      if (value !== undefined && value !== null) query[key] = String(value);
    }

    if (auth.prompt === "omit") {
      delete query.prompt;
    } else if (typeof auth.prompt === "string" && auth.prompt.length > 0) {
      query.prompt = auth.prompt;
    }

    let codeVerifier: string | undefined;
    if (auth.pkce === true) {
      codeVerifier = randomBytesImpl(32).toString("base64url").slice(0, 43);
      const method = auth.pkceMethod === "S256" ? "S256" : "plain";
      query.code_challenge_method = method;
      query.code_challenge =
        method === "S256"
          ? createHash("sha256").update(codeVerifier).digest("base64url")
          : codeVerifier;
    }

    const url = new URL(authUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== "") url.searchParams.append(key, value);
    }
    return { authorizationUrl: url.toString(), codeVerifier };
  };

  const claim = async (request: unknown): Promise<JsonRecord> => {
    if (!isRecord(request) || request.type !== "OAUTH2" || !isRecord(request.value)) {
      throw new StudioV2ActivepiecesOAuthError(
        "invalid_connection",
        400,
        "Activepieces OAuth connection request is invalid."
      );
    }
    const pieceName = requiredString(request, "pieceName", "piece name");
    const pieceVersion = optionalString(request, "pieceVersion");
    const value = request.value;
    const clientId = requiredString(value, "client_id", "client ID");
    const clientSecret = requiredString(value, "client_secret", "client secret");
    const props = requestProps(value.props);
    const grantType = optionalString(value, "grant_type") ?? "authorization_code";
    const auth = await getAuth(pieceName, pieceVersion);
    const tokenUrl = resolveValueFromProps(props, requiredString(auth, "tokenUrl", "token URL"));
    const form: Record<string, string> = { grant_type: grantType };

    if (grantType === "authorization_code") {
      form.redirect_uri = requiredString(value, "redirect_url", "redirect URL");
      form.code = requiredString(value, "code", "authorization code");
    } else if (grantType === "client_credentials") {
      const scope = optionalString(value, "scope");
      if (scope) form.scope = resolveValueFromProps(props, scope);
      if (props) {
        for (const [key, propValue] of Object.entries(props)) form[key] = String(propValue);
      }
    } else {
      throw new StudioV2ActivepiecesOAuthError(
        "invalid_connection",
        400,
        `Unsupported Activepieces OAuth grant type: ${grantType}`
      );
    }

    const codeVerifier = optionalString(value, "code_challenge");
    if (codeVerifier) form.code_verifier = codeVerifier;

    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };
    const authorizationMethod = optionalString(value, "authorization_method") ?? "BODY";
    if (authorizationMethod === "BODY") {
      form.client_id = clientId;
      form.client_secret = clientSecret;
    } else if (authorizationMethod === "HEADER") {
      headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    } else {
      throw new StudioV2ActivepiecesOAuthError(
        "invalid_connection",
        400,
        `Unsupported Activepieces OAuth authorization method: ${authorizationMethod}`
      );
    }

    let response: Response;
    try {
      response = await fetchImpl(tokenUrl, {
        method: "POST",
        headers,
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new StudioV2ActivepiecesOAuthError(
        "invalid_claim",
        503,
        error instanceof Error
          ? `OAuth token claim failed: ${error.message}`
          : "OAuth token claim failed."
      );
    }
    const token = await readJsonResponse(response);
    if (typeof token.access_token !== "string" || token.access_token.length === 0) {
      throw new StudioV2ActivepiecesOAuthError(
        "invalid_claim",
        400,
        "The OAuth provider did not return an access token."
      );
    }

    const claimedAt = Math.round(now() / 1000);
    return {
      ...request,
      value: {
        type: "OAUTH2",
        ...token,
        data: tokenResponseData(token),
        claimed_at: claimedAt,
        token_url: tokenUrl,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_url: optionalString(value, "redirect_url") ?? "",
        grant_type: grantType,
        props,
        authorization_method: authorizationMethod,
      },
    };
  };

  const refresh = async (request: unknown): Promise<JsonRecord> => {
    if (!isRecord(request) || request.type !== "OAUTH2" || !isRecord(request.value)) {
      throw new StudioV2ActivepiecesOAuthError(
        "invalid_connection",
        400,
        "Activepieces OAuth refresh request is invalid."
      );
    }
    const value = request.value;
    const refreshToken = requiredString(value, "refresh_token", "refresh token");
    const tokenUrl = requiredString(value, "token_url", "token URL");
    const clientId = requiredString(value, "client_id", "client ID");
    const clientSecret = requiredString(value, "client_secret", "client secret");
    const authorizationMethod = optionalString(value, "authorization_method") ?? "BODY";
    const form: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    };
    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };
    if (authorizationMethod === "BODY") {
      form.client_id = clientId;
      form.client_secret = clientSecret;
    } else if (authorizationMethod === "HEADER") {
      headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    } else {
      throw new StudioV2ActivepiecesOAuthError(
        "invalid_connection",
        400,
        `Unsupported Activepieces OAuth authorization method: ${authorizationMethod}`
      );
    }

    let response: Response;
    try {
      response = await fetchImpl(tokenUrl, {
        method: "POST",
        headers,
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new StudioV2ActivepiecesOAuthError(
        "refresh_failed",
        503,
        error instanceof Error
          ? `OAuth token refresh failed: ${error.message}`
          : "OAuth token refresh failed."
      );
    }
    const token = await readJsonResponse(response);
    if (typeof token.access_token !== "string" || token.access_token.length === 0) {
      throw new StudioV2ActivepiecesOAuthError(
        "refresh_failed",
        400,
        "The OAuth provider did not return a refreshed access token."
      );
    }
    return {
      ...request,
      value: {
        ...value,
        ...token,
        refresh_token: typeof token.refresh_token === "string" ? token.refresh_token : refreshToken,
        data: tokenResponseData(token),
        claimed_at: Math.round(now() / 1000),
      },
    };
  };

  return { authorizationUrl, claim, refresh };
}
