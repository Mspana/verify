import type { SessionResponse } from "@verify/shared";

// Thin fetch wrapper for our Worker endpoints. Same-origin in both dev
// (via Vite proxy) and prod (Pages + Workers on one domain), so cookies
// flow naturally. Full endpoint coverage lands in step 2; this module
// carries only what the AppShell smoke test needs.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function postSession(): Promise<SessionResponse> {
  return req<SessionResponse>("/api/session", { method: "POST" });
}

// Health endpoint shape is local-only; not in shared types per plan.
export type HealthResponse = {
  status: "ok" | "degraded";
  worker: "ok";
  truthscan: string;
};

export function getHealth(): Promise<HealthResponse> {
  return req<HealthResponse>("/api/health");
}
