import { describe, expect, it } from "vitest";

import { toNetlifyEvent, toResponse } from "./netlifyAdapter";

describe("toNetlifyEvent", () => {
  it("gives a GET the method, lowercased headers, query and no body", async () => {
    const event = await toNetlifyEvent(
      new Request("https://backup.example/api/stock?symbol=TCS.NS&x=1&x=2", { headers: { "If-None-Match": '"abc"', "X-Custom": "v" } })
    );
    expect(event).toMatchObject({
      httpMethod: "GET",
      path: "/api/stock",
      rawUrl: "https://backup.example/api/stock?symbol=TCS.NS&x=1&x=2",
      queryStringParameters: { symbol: "TCS.NS", x: "2" },
      body: null,
      isBase64Encoded: false,
    });
    expect(event.headers["if-none-match"]).toBe('"abc"');
    expect(event.headers["x-custom"]).toBe("v");
  });

  it("passes a POST body through as text", async () => {
    const event = await toNetlifyEvent(
      new Request("https://backup.example/.netlify/functions/nutrition-ai", {
        method: "POST",
        headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
        body: JSON.stringify({ text: "2 idli" }),
      })
    );
    expect(event.httpMethod).toBe("POST");
    expect(event.headers.authorization).toBe("Bearer t");
    expect(JSON.parse(event.body!)).toEqual({ text: "2 idli" });
  });

  it("can leave headers out", async () => {
    const event = await toNetlifyEvent(new Request("https://b.example/api/stock", { headers: { "If-None-Match": "x" } }), ["If-None-Match"]);
    expect(event.headers["if-none-match"]).toBeUndefined();
  });
});

describe("toResponse", () => {
  it("keeps status, headers and body", async () => {
    const response = toResponse({ statusCode: 404, headers: { "Content-Type": "application/json", ETag: "e" }, body: '{"success":false}' });
    expect(response.status).toBe(404);
    expect(response.headers.get("etag")).toBe("e");
    expect(await response.json()).toEqual({ success: false });
  });

  it("sends no body for 204 and 304", async () => {
    expect(await toResponse({ statusCode: 204, headers: {}, body: "" }).text()).toBe("");
    expect(await toResponse({ statusCode: 304, headers: { ETag: "e" }, body: "" }).text()).toBe("");
  });

  it("decodes a base64 body", async () => {
    const response = toResponse({ statusCode: 200, body: btoa("hello"), isBase64Encoded: true });
    expect(await response.text()).toBe("hello");
  });
});
