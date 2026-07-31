import type { SerializeFrom } from "@remix-run/node";
import type { StudioV2ReleaseProjection } from "./release-contract";
import type { StudioV2WorkspaceProjection } from "./workspace-contract";

/**
 * Remix serializes loader and action payloads before they reach browser code.
 * Keep the server projections strict and expose their transport-safe shapes at
 * the Studio component boundary instead of weakening the domain contracts.
 */
export type StudioV2ClientWorkspaceProjection =
  SerializeFrom<StudioV2WorkspaceProjection>;

export type StudioV2ClientReleaseProjection =
  SerializeFrom<StudioV2ReleaseProjection>;
