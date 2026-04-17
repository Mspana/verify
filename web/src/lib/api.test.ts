import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, getHealth, getScan, postSession } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("api wrapper", () => {
  it("parses a 200 JSON body on the happy path", async () => {
    mockFetch(async () => jsonResponse({ userId: "abc" }));
    const res = await postSession();
    expect(res.userId).toBe("abc");
  });

  it("sends credentials and requests JSON", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({ userId: "abc" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await postSession();
    const call = fetchMock.mock.calls[0]!;
    const path = call[0];
    const init = call[1];
    expect(path).toBe("/api/session");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect((init?.headers as Record<string, string>)["Accept"]).toBe(
      "application/json",
    );
  });

  it("maps a Worker-shaped 4xx error into a typed ApiError", async () => {
    mockFetch(async () =>
      jsonResponse(
        {
          code: "FILE_TOO_LARGE",
          message: "This image is 12 MB. Maximum is 10 MB.",
          retryable: true,
        },
        { status: 400 },
      ),
    );
    await expect(getScan("x")).rejects.toMatchObject({
      name: "ApiError",
      code: "FILE_TOO_LARGE",
      message: "This image is 12 MB. Maximum is 10 MB.",
      retryable: true,
      status: 400,
      isNetwork: false,
    });
  });

  it("preserves QUOTA_EXCEEDED with retryable=false for a 429 carrying our shape", async () => {
    mockFetch(async () =>
      jsonResponse(
        {
          code: "QUOTA_EXCEEDED",
          message: "You've used all your scans for today.",
          retryable: false,
        },
        { status: 429 },
      ),
    );
    await expect(getScan("x")).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      retryable: false,
    });
  });

  it("synthesizes RATE_LIMITED from a bare 429 and surfaces Retry-After", async () => {
    mockFetch(async () =>
      new Response("slow down", {
        status: 429,
        headers: { "Retry-After": "42" },
      }),
    );
    try {
      await getScan("x");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.code).toBe("RATE_LIMITED");
      expect(err.retryable).toBe(true);
      expect(err.retryAfterSeconds).toBe(42);
    }
  });

  it("synthesizes INTERNAL_ERROR from a bare 5xx without our shape", async () => {
    mockFetch(async () => new Response("gateway down", { status: 502 }));
    await expect(getHealth()).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      retryable: true,
      status: 502,
    });
  });

  it("flags network failures as isNetwork so callers can show offline UX", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    try {
      await getHealth();
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.code).toBe("INTERNAL_ERROR");
      expect(err.isNetwork).toBe(true);
      expect(err.retryable).toBe(true);
    }
  });
});
