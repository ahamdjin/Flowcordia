export type FirstOwnerState = {
  isSelfHosted: boolean;
  claimed: boolean;
};

export function isFirstOwnerClaimOpen(state: FirstOwnerState): boolean {
  return state.isSelfHosted && !state.claimed;
}
