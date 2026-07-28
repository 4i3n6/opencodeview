export interface FlagMap {
  readonly [flag: string]: number;
}

export function apiQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const serialized = qs.toString();
  return serialized ? `?${serialized}` : "";
}

function authHeaders(): HeadersInit {
  const token =
    (typeof localStorage !== "undefined" ? localStorage.getItem("opencodeview_auth_token") : null) ??
    (typeof import.meta !== "undefined"
      ? (import.meta as ImportMeta & { readonly env?: { readonly VITE_OPENCODEVIEW_AUTH_TOKEN?: string } }).env
          ?.VITE_OPENCODEVIEW_AUTH_TOKEN
      : undefined) ??
    "";
  const trimmed = token.trim();
  return trimmed.length > 0 ? { Authorization: `Bearer ${trimmed}` } : {};
}

export async function get<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}
