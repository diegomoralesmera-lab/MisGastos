// Conexion con Google (Gmail) via OAuth 2.0. La clave del usuario se ingresa
// solo en la pantalla oficial de Google; el intercambio de tokens ocurre en
// el servidor (api/google-token.ts), que guarda el client secret.

export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

const SCOPES = 'openid email https://www.googleapis.com/auth/gmail.readonly';
const STORAGE_KEY = 'misgastos_g_auth';

interface StoredAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  email?: string;
}

function redirectUri(): string {
  return `${window.location.origin}/gasto/conectar`;
}

function apiBase(): string {
  return window.location.origin;
}

function loadAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveAuth(auth: StoredAuth): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  } catch {}
}

export function isGoogleConnected(): boolean {
  return !!loadAuth();
}

export function getGoogleEmail(): string | null {
  return loadAuth()?.email || null;
}

export function disconnectGoogle(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function startGoogleLogin(): void {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: 'google',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function decodeJwtEmail(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.email;
  } catch {
    return undefined;
  }
}

async function tokenRequest(body: object): Promise<StoredAuth> {
  const res = await fetch(`${apiBase()}/api/google-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error || 'No se pudo conectar con Google');
  }
  const prev = loadAuth();
  const auth: StoredAuth = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || prev?.refreshToken,
    expiresAt: Date.now() + ((data.expires_in || 3600) - 120) * 1000,
    email: decodeJwtEmail(data.id_token) || prev?.email,
  };
  saveAuth(auth);
  return auth;
}

export async function completeGoogleLogin(code: string): Promise<void> {
  await tokenRequest({ code, redirectUri: redirectUri() });
}

export async function getGoogleAccessToken(): Promise<string | null> {
  const auth = loadAuth();
  if (!auth) return null;
  if (Date.now() < auth.expiresAt) return auth.accessToken;
  if (!auth.refreshToken) {
    disconnectGoogle();
    return null;
  }
  try {
    const renewed = await tokenRequest({ refreshToken: auth.refreshToken });
    return renewed.accessToken;
  } catch {
    disconnectGoogle();
    return null;
  }
}
