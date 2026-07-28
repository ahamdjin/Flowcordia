import { describe, expect, it } from "vitest";
import {
  buildClickhouseReadinessRequest,
  evaluateApplicationOrigin,
} from "../app/features/flowcordia/setup/platformReadiness.server";

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

describe("self-host ClickHouse readiness request", () => {
  it("maps the runtime database path to the ClickHouse HTTP database parameter", () => {
    const request = buildClickhouseReadinessRequest(
      "http://default:secret@clickhouse:8123/default?secure=false"
    );

    expect(request.url.origin).toBe("http://clickhouse:8123");
    expect(request.url.pathname).toBe("/");
    expect(request.url.searchParams.get("database")).toBe("default");
    expect(request.url.searchParams.has("secure")).toBe(false);
    expect(request.url.username).toBe("");
    expect(request.url.password).toBe("");
    expect(request.headers.get("Authorization")).toBe(
      `Basic ${Buffer.from("default:secret").toString("base64")}`
    );
  });
});
