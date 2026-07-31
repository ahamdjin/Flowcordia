type PieceLookup = {
  name: string;
  version?: string;
};

type LocalPieceModel = {
  name: string;
  displayName: string;
  description: string;
  logoUrl: string;
  version: string;
  packageType: "REGISTRY";
  pieceType: "OFFICIAL";
  categories: string[];
  authors: string[];
  minimumSupportedRelease: string;
  auth: undefined;
  actions: Record<string, LocalActionModel>;
  triggers: Record<string, LocalTriggerModel>;
};

type LocalActionModel = {
  name: string;
  displayName: string;
  description: string;
  props: Record<string, unknown>;
  requireAuth: boolean;
  errorHandlingOptions?: {
    continueOnFailure: { hide: boolean; defaultValue: boolean };
    retryOnFailure: { hide: boolean; defaultValue: boolean };
  };
};

type LocalTriggerModel = {
  name: string;
  displayName: string;
  description: string;
  props: Record<string, unknown>;
  requireAuth: boolean;
};

const manualTrigger: LocalPieceModel = Object.freeze({
  name: "@activepieces/piece-manual-trigger",
  displayName: "Manual Trigger",
  description: "Manually start a Flowcordia workflow.",
  logoUrl: "https://cdn.activepieces.com/pieces/new-core/manual-trigger.svg",
  version: "0.0.5",
  packageType: "REGISTRY",
  pieceType: "OFFICIAL",
  categories: ["CORE"],
  authors: ["Activepieces"],
  minimumSupportedRelease: "0.78.0",
  auth: undefined,
  actions: {},
  triggers: {
    manual_trigger: {
      name: "manual_trigger",
      displayName: "Manual Trigger",
      description: "Manually start your workflow without extra configuration.",
      props: {},
      requireAuth: false,
    },
  },
});

const httpPiece: LocalPieceModel = Object.freeze({
  name: "@activepieces/piece-http",
  displayName: "HTTP",
  description: "Send HTTP requests and return responses.",
  logoUrl: "https://cdn.activepieces.com/pieces/new-core/http.svg",
  version: "0.11.13",
  packageType: "REGISTRY",
  pieceType: "OFFICIAL",
  categories: ["CORE"],
  authors: ["Activepieces"],
  minimumSupportedRelease: "0.20.3",
  auth: undefined,
  actions: {
    send_request: {
      name: "send_request",
      displayName: "Send HTTP request",
      description: "Send HTTP request",
      props: {},
      requireAuth: false,
      errorHandlingOptions: {
        continueOnFailure: { hide: true, defaultValue: false },
        retryOnFailure: { hide: true, defaultValue: false },
      },
    },
  },
  triggers: {},
});

export const FLOWCORDIA_ACTIVEPIECES_PIECES = Object.freeze({
  [manualTrigger.name]: manualTrigger,
  [httpPiece.name]: httpPiece,
});

function getLocalPiece({ name, version }: PieceLookup): LocalPieceModel {
  const piece = FLOWCORDIA_ACTIVEPIECES_PIECES[name as keyof typeof FLOWCORDIA_ACTIVEPIECES_PIECES];
  if (!piece) {
    throw new Error(`Flowcordia Studio does not expose Activepieces piece ${name}.`);
  }
  if (version && version !== piece.version) {
    throw new Error(
      `Flowcordia Studio expected ${piece.name}@${piece.version}, received ${version}.`
    );
  }
  return piece;
}

function summary(piece: LocalPieceModel) {
  return {
    ...piece,
    actions: Object.keys(piece.actions).length,
    triggers: Object.keys(piece.triggers).length,
    suggestedActions: [],
    suggestedTriggers: [],
  };
}

/**
 * Browser-only replacement for the Activepieces server piece catalog. Flowcordia
 * intentionally supports a curated node surface here; execution remains owned
 * by Flowcordia and Trigger.dev rather than an Activepieces API server.
 */
export const piecesApi = {
  async get(request: PieceLookup): Promise<LocalPieceModel> {
    return getLocalPiece(request);
  },
  async list(): Promise<ReturnType<typeof summary>[]> {
    return Object.values(FLOWCORDIA_ACTIVEPIECES_PIECES).map(summary);
  },
  async registry(): Promise<Array<{ name: string; version: string }>> {
    return Object.values(FLOWCORDIA_ACTIVEPIECES_PIECES).map(({ name, version }) => ({
      name,
      version,
    }));
  },
  async options(): Promise<never> {
    throw new Error("Dynamic Activepieces piece options are not available in Flowcordia Studio.");
  },
  async syncFromCloud(): Promise<void> {},
  async install(): Promise<never> {
    throw new Error("Pieces are installed through Flowcordia node packages, not Studio.");
  },
  async delete(): Promise<never> {
    throw new Error("Flowcordia Studio cannot delete built-in node packages.");
  },
};
