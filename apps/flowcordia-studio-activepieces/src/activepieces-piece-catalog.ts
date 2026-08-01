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

const availablePieces = Object.freeze({
  [manualTrigger.name]: manualTrigger,
  [httpPiece.name]: httpPiece,
});

export function getAvailablePiece({ name, version }: PieceLookup): LocalPieceModel {
  const piece = availablePieces[name as keyof typeof availablePieces];
  if (!piece) {
    throw new Error(`Flowcordia Studio does not have Activepieces piece source for ${name}.`);
  }
  if (version && version !== piece.version) {
    throw new Error(
      `Flowcordia Studio expected ${piece.name}@${piece.version}, received ${version}.`
    );
  }
  return piece;
}

export function listAvailablePieces() {
  return Object.values(availablePieces).map((piece) => ({
    ...piece,
    actions: Object.keys(piece.actions).length,
    triggers: Object.keys(piece.triggers).length,
    suggestedActions: [],
    suggestedTriggers: [],
  }));
}

export function listAvailablePiecePackages() {
  return Object.values(availablePieces).map(({ name, version }) => ({ name, version }));
}
