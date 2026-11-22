const DEFAULT_API_BASE_URL = import.meta.env.DEV
  ? "http://localhost:3000/api"
  : "https://vida-server-9khr.onrender.com/api";

const DEFAULT_APP_URL = import.meta.env.DEV
  ? "http://localhost:5173"
  : "https://vida-acolhimento-digital.netlify.app";

function productionSafeUrl(configuredUrl: string | undefined, fallbackUrl: string) {
  const url = configuredUrl?.trim();
  if (!url) return fallbackUrl;

  const pointsToLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(url);
  if (import.meta.env.PROD && pointsToLocalhost) return fallbackUrl;

  return url;
}

export const API_BASE_URL = productionSafeUrl(
  import.meta.env.VITE_API_BASE_URL,
  DEFAULT_API_BASE_URL,
).replace(/\/$/, "");

export const APP_URL = productionSafeUrl(import.meta.env.VITE_APP_URL, DEFAULT_APP_URL).replace(
  /\/$/,
  "",
);

const TOKEN_KEY = "vidaplus:access_token";
const REFRESH_TOKEN_KEY = "vidaplus:refresh_token";

type ApiErrorBody = {
  status?: string;
  message?: string;
  requestId?: string;
};

type RefreshResponse = {
  data?: {
    session?: {
      access_token?: string;
      refresh_token?: string;
    };
  };
};

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function getRefreshToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
  else window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem("vidaplus:user_id");
  window.localStorage.removeItem("vidaplus:role");
  window.localStorage.removeItem("vidaplus:auth");
  window.localStorage.removeItem("vidaplus:user");
}

let activeRefresh: Promise<boolean> | null = null;

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  if (!activeRefresh) {
    activeRefresh = (async () => {
      try {
        const response = await fetch(API_BASE_URL + "/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        const payload = safeJson<RefreshResponse>(await response.text());
        const session = payload?.data?.session;

        if (!response.ok || !session?.access_token) return false;

        setAccessToken(session.access_token);
        setRefreshToken(session.refresh_token ?? refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        activeRefresh = null;
      }
    })();
  }

  return activeRefresh;
}

import { handleSupabaseRequest } from "./supabaseAdapter";

export async function http<T>(
  path: string,
  init: RequestInit = {},
  retryAfterRefresh = true,
): Promise<T> {
  // 1. Tenta executar diretamente pelo Supabase Client (Zero servidores dormindo)
  try {
    const supabaseResult = await handleSupabaseRequest<T>(path, init.method || "GET", init.body);
    if (supabaseResult !== null) {
      return supabaseResult;
    }
  } catch (err: any) {
    // Se o Supabase lançou um erro de regra ou auth, propaga para a UI
    throw err;
  }

  const token = getAccessToken();
  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", "Bearer " + token);
  }

  let response: Response;
  try {
    response = await fetch(API_BASE_URL + path, {
      ...init,
      headers,
    });
  } catch (netErr: any) {
    throw new Error(netErr.message || "Não foi possível conectar ao servidor.");
  }

  const text = await response.text();
  const body = text ? safeJson<ApiErrorBody | T>(text) : null;


  if (!response.ok) {
    if (response.status === 401 && retryAfterRefresh && (await refreshAccessToken())) {
      return http<T>(path, init, false);
    }

    if (response.status === 401) {
      clearSession();
      if (typeof window !== "undefined") window.location.assign("/login");
    }

    const message =
      body && typeof body === "object" && "message" in body && body.message
        ? body.message
        : "HTTP " + response.status;
    throw new Error(message);
  }

  return body as T;
}

function safeJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}
