import { describe, expect, it } from "vitest";
import { isFlowcordiaActivepiecesHandshakeRequest } from "./activepieces-webhook.js";

const payload = {
  method: "POST",
  headers: { "x-provider-challenge": "present" },
  queryParams: { challenge: "query" },
  body: { verification: "body" },
  rawBody: '{"verification":"body"}',
};

describe("Activepieces webhook handshake matching", () => {
  it("matches HEADER_PRESENT using Activepieces lowercase header semantics", () => {
    expect(
      isFlowcordiaActivepiecesHandshakeRequest({
        payload,
        handshakeConfiguration: {
          strategy: "HEADER_PRESENT",
          paramName: "X-Provider-Challenge",
        },
      })
    ).toBe(true);
  });

  it("matches QUERY_PRESENT", () => {
    expect(
      isFlowcordiaActivepiecesHandshakeRequest({
        payload,
        handshakeConfiguration: { strategy: "QUERY_PRESENT", paramName: "challenge" },
      })
    ).toBe(true);
  });

  it("matches BODY_PARAM_PRESENT", () => {
    expect(
      isFlowcordiaActivepiecesHandshakeRequest({
        payload,
        handshakeConfiguration: {
          strategy: "BODY_PARAM_PRESENT",
          paramName: "verification",
        },
      })
    ).toBe(true);
  });

  it("matches HEAD_REQUEST independently of parameter names", () => {
    expect(
      isFlowcordiaActivepiecesHandshakeRequest({
        payload: { ...payload, method: "head" },
        handshakeConfiguration: { strategy: "HEAD_REQUEST" },
      })
    ).toBe(true);
  });

  it("does not treat NONE or missing parameters as a handshake", () => {
    expect(
      isFlowcordiaActivepiecesHandshakeRequest({
        payload,
        handshakeConfiguration: { strategy: "NONE" },
      })
    ).toBe(false);
    expect(
      isFlowcordiaActivepiecesHandshakeRequest({
        payload,
        handshakeConfiguration: { strategy: "QUERY_PRESENT" },
      })
    ).toBe(false);
  });
});
