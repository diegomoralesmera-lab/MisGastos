// Conexion con Microsoft (Outlook/Hotmail) via OAuth 2.0 + PKCE.
// La clave del usuario nunca pasa por la app: se ingresa en la pantalla
// oficial de Microsoft y la app solo recibe un token de lectura de correo.

export const MS_CLIENT_ID = process.env.EXPO_PUBLIC_MS_CLIENT_ID || '';

const AUTHORITY = 'https://login.microsoftonline.com/common';
const SCOPES = 'openid profile email offline_access https://graph.microsoft.com/Mail.Read';
const STORAGE_KEY = 'misgastos_ms_auth';
const VERIFIER_KEY = 'misgastos_ms_pkce';

interface StoredAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  email?: string;
}

function redirectUri(): string {
  return `${window.location.origin}/gasto/conectar`;
}

function base64url(bytes: Uint8Array): string {
  let str = '';
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64url(bytes).slice(0, length);
}

async function sha256base64url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64url(new Uint8Array(digest));
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

export function isConnected(): boolean {
  return !!loadAuth();
}

export function getConnectedEmail(): string | null {
  return loadAuth()?.email || null;
}

export function disconnect(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(VERIFIER_KEY);
  } catch {}
}

export async function startLogin(): Promise<void> {
  const verifier = randomString(64);
  localStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = await sha256base64url(verifier);
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  window.location.href = `${AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
}

function decodeJwtEmail(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.preferred_username || payload.email;
  } catch {
    return undefined;
  }
}

async function tokenRequest(body: URLSearchParams): Promise<StoredAuth> {
  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || 'No se pudo conectar con Microsoft');
  }
  const prev = loadAuth();
  const auth: StoredAuth = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || prev?.refreshToken,
    expiresAt: Date.now() + (data.expires_in - 120) * 1000,
    email: decodeJwtEmail(data.id_token) || prev?.email,
  };
  saveAuth(auth);
  return auth;
}

export async function completeLogin(code: string): Promise<void> {
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error('Sesion de login expirada, intenta de nuevo');
  await tokenRequest(
    new URLSearchParams({
      client_id: MS_CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
      scope: SCOPES,
    })
  );
  localStorage.removeItem(VERIFIER_KEY);
}

export async function getAccessToken(): Promise<string | null> {
  const auth = loadAuth();
  if (!auth) return null;
  if (Date.now() < auth.expiresAt) return auth.accessToken;
  if (!auth.refreshToken) {
    disconnect();
    return null;
  }
  try {
    const renewed = await tokenRequest(
      new URLSearchParams({
        client_id: MS_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: auth.refreshToken,
        scope: SCOPES,
      })
    );
    return renewed.accessToken;
  } catch {
    disconnect();
    return null;
  }
}
