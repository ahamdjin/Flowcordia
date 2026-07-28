import { describe, expect, it } from "vitest";
import { evaluateApplicationOrigin } from "../app/features/flowcordia/setup/platformReadiness.server";

describe("self-host application-origin readiness", () => {
  it("accepts matching public HTTPS origins", () => {
    const result = evaluateApplicationOrigin({
      appOrigin: "https://flowcordia.example.com",
      loginOrigin: "https://flowcordia.example.com",
      requestOrigin: "https://flowcordia.example.com",
      appEnv: "production",
    });

    expect(result.state).toBe("ready");
    expect(result.recovery).toBeNull();
  });

  it("rejects different application and login origins", () => {
    const result = evaluateApplicationOrigin({
      appOrigin: "https://flowcordia.example.com",
      loginOrigin: "https://login.example.com",
      requestOrigin: "https://flowcordia.example.com",
      appEnv: "production",
    });

    expect(result.state).toBe("misconfigured");
    expect(result.summary).toContain("different public origins");
  });

  it("rejects a configured origin that differs from the browser origin", () => {
    const result = evaluateApplicationOrigin({
      appOrigin: "https://internal.example.com",
      loginOrigin: "https://internal.example.com",
      requestOrigin: "https://flowcordia.example.com",
      appEnv: "production",
    });

    expect(result.state).toBe("misconfigured");
    expect(result.recovery).toContain("browser-visible URL");
  });

  it("requires HTTPS for non-loopback production origins", () => {
    const result = evaluateApplicationOrigin({
      appOrigin: "http://flowcordia.example.com",
      loginOrigin: "http://flowcordia.example.com",
      requestOrigin: "http://flowcordia.example.com",
      appEnv: "production",
    });

    expect(result.state).toBe("misconfigured");
    expect(result.summary).toContain("not protected by HTTPS");
  });

  it("allows HTTP on loopback for local production-shaped rehearsals", () => {
    const result = evaluateApplicationOrigin({
      appOrigin: "http://localhost:3030",
      loginOrigin: "http://localhost:3030",
      requestOrigin: "http://localhost:3030",
      appEnv: "production",
    });

    expect(result.state).toBe("ready");
  });
});
