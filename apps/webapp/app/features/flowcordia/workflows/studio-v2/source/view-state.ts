export type StudioV2View = "editor" | "source";

export function resolveStudioV2View(searchParams: URLSearchParams): StudioV2View {
  return searchParams.get("view") === "source" ? "source" : "editor";
}

export function hasInvalidStudioV2View(searchParams: URLSearchParams): boolean {
  const view = searchParams.get("view");
  return view !== null && view !== "source";
}

export function studioV2SearchParamsForView(
  searchParams: URLSearchParams,
  view: StudioV2View
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  if (view === "source") {
    next.set("view", "source");
  } else {
    next.delete("view");
  }
  return next;
}

export function normalizeStudioV2ViewSearchParams(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  if (hasInvalidStudioV2View(next)) next.delete("view");
  return next;
}

export function isStudioV2ViewOnlyNavigation(currentUrl: URL, nextUrl: URL): boolean {
  if (currentUrl.pathname !== nextUrl.pathname) return false;
  if (currentUrl.searchParams.get("view") === nextUrl.searchParams.get("view")) return false;

  const withoutView = (url: URL) => {
    const params = new URLSearchParams(url.search);
    params.delete("view");
    params.sort();
    return params.toString();
  };

  return withoutView(currentUrl) === withoutView(nextUrl);
}
