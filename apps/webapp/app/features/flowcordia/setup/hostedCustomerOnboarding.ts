export function projectGitHubOnboardingPath(input: {
  organizationSlug: string;
  projectSlug: string;
}): string {
  const search = new URLSearchParams({
    organization: input.organizationSlug,
    project: input.projectSlug,
  });
  return `/setup/github?${search.toString()}`;
}

export function flowcordiaStudioPath(input: {
  organizationSlug: string;
  projectSlug: string;
  environmentSlug?: string;
}): string {
  return `/orgs/${encodeURIComponent(input.organizationSlug)}/projects/${encodeURIComponent(
    input.projectSlug
  )}/env/${encodeURIComponent(input.environmentSlug ?? "prod")}/flowcordia/workflows`;
}
