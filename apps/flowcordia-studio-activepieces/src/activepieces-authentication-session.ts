let projectId: string | null = null;

export function configureActivepiecesAuthenticationSession(nextProjectId: string) {
  projectId = nextProjectId;
}

export const authenticationSession = {
  setProjectId(nextProjectId: string) {
    projectId = nextProjectId;
  },
  saveResponse() {},
  isJwtExpired() {
    return false;
  },
  getToken(): string | null {
    return null;
  },
  getProjectId(): string | null {
    return projectId;
  },
  getCurrentUserId(): string | null {
    return "flowcordia-studio-user";
  },
  appendProjectRoutePrefix(path: string): string {
    if (!projectId) return path;
    return `/projects/${projectId}${path.startsWith("/") ? path : `/${path}`}`;
  },
  getPlatformId(): string | null {
    return "flowcordia";
  },
  isOnboarding(): boolean {
    return false;
  },
  async switchToPlatform() {},
  switchToProject(nextProjectId: string) {
    projectId = nextProjectId;
  },
  isLoggedIn(): boolean {
    return true;
  },
  clearSession() {},
  logOut() {},
};
