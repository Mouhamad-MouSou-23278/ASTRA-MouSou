// Thin fetch wrapper. All authorisation decisions are made by the server; the
// client only attaches whichever credential it holds (user JWT or QR viewer token).

export class ApiError extends Error {
  constructor(public status: number, message: string, public problems: string[] = []) {
    super(message);
  }
}

export interface Access {
  /** QR viewer token; when set it is used instead of the logged-in user's JWT. */
  viewerToken?: string;
}

const TOKEN_KEY = "astra.token";
let token: string | null = null;
try {
  token = window.localStorage.getItem(TOKEN_KEY);
} catch {
  token = null;
}
let onUnauthorized: (() => void) | null = null;

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null): void {
  token = value;
  try {
    if (value) window.localStorage.setItem(TOKEN_KEY, value);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode): the token lives for this tab only */
  }
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

function describe(detail: unknown): { message: string; problems: string[] } {
  if (typeof detail === "string") return { message: detail, problems: [] };
  if (Array.isArray(detail)) {
    // FastAPI / pydantic validation errors
    const problems = detail.map((d) => {
      const loc = Array.isArray(d?.loc) ? d.loc.filter((p: unknown) => p !== "body").join(".") : "";
      return `${loc ? loc + ": " : ""}${d?.msg ?? JSON.stringify(d)}`;
    });
    return { message: problems.join("; "), problems };
  }
  if (detail && typeof detail === "object") {
    const d = detail as { message?: string; problems?: string[] };
    return { message: d.message ?? "Request failed", problems: d.problems ?? [] };
  }
  return { message: "Request failed", problems: [] };
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; form?: FormData; access?: Access } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.access?.viewerToken) headers["X-Viewer-Token"] = opts.access.viewerToken;
  else if (token) headers["Authorization"] = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
  } catch {
    throw new ApiError(0, "Cannot reach the ASTRA server. Is the backend running?");
  }
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && !opts.access?.viewerToken && token && path !== "/auth/login") {
      onUnauthorized?.();
    }
    const { message, problems } = describe(payload?.detail ?? res.statusText);
    throw new ApiError(res.status, message, problems);
  }
  return payload as T;
}

/** Credential headers for requests that cannot go through `api` (binary responses). */
export function authHeaders(access?: Access): Record<string, string> {
  if (access?.viewerToken) return { "X-Viewer-Token": access.viewerToken };
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function streamUrl(sessionId: string, access?: Access): string {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const query = access?.viewerToken
    ? `viewer_token=${encodeURIComponent(access.viewerToken)}`
    : `token=${encodeURIComponent(token ?? "")}`;
  return `${scheme}://${window.location.host}/api/ws/sessions/${sessionId}?${query}`;
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
