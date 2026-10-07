const AUTH_BASE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPES = 'Mail.Read offline_access openid profile';
const TOKEN_KEY = 'ms_tokens';
const VERIFIER_KEY = 'ms_pkce_verifier';
const CLIENT_ID_KEY = 'ms_client_id';

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  account_name?: string;
  account_email?: string;
}

function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = base64URLEncode(array.buffer);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64URLEncode(hash);
  return { verifier, challenge };
}

export function getClientId(): string {
  try {
    return localStorage.getItem(CLIENT_ID_KEY) || '';
  } catch {
    return '';
  }
}

export function setClientId(id: string): void {
  try {
    localStorage.setItem(CLIENT_ID_KEY, id.trim());
  } catch {}
}

function getRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin + '/gasto/sync';
}

function getStoredTokens(): TokenData | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeTokens(data: TokenData): void {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
  } catch {}
}

function clearTokens(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export async function startLogin(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) throw new Error('NO_CLIENT_ID');

  const { verifier, challenge } = await generatePKCE();
  try {
    sessionStorage.setItem(VERIFIER_KEY, verifier);
  } catch {}

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    response_mode: 'query',
  });

  window.location.href = `${AUTH_BASE}/authorize?${params}`;
}

export async function handleCallback(code: string): Promise<TokenData> {
  const clientId = getClientId();
  let verifier = '';
  try {
    verifier = sessionStorage.getItem(VERIFIER_KEY) || '';
    sessionStorage.removeItem(VERIFIER_KEY);
  } catch {}

  const response = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error_description || 'Error de autenticacion');
  }

  const data = await response.json();
  const tokens: TokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };

  try {
    const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (userRes.ok) {
      const user = await userRes.json();
      tokens.account_name = user.displayName;
      tokens.account_email = user.mail || user.userPrincipalName;
    }
  } catch {}

  storeTokens(tokens);
  return tokens;
}

export async function getAccessToken(): Promise<string> {
  const tokens = getStoredTokens();
  if (!tokens) throw new Error('NOT_SIGNED_IN');

  if (Date.now() < tokens.expires_at) {
    return tokens.access_token;
  }

  const clientId = getClientId();
  const response = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      scope: SCOPES,
    }),
  });

  if (!response.ok) {
    clearTokens();
    throw new Error('TOKEN_REFRESH_FAILED');
  }

  const data = await response.json();
  const newTokens: TokenData = {
    ...tokens,
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  storeTokens(newTokens);
  return newTokens.access_token;
}

export function getAccount(): { name: string; email: string } | null {
  const tokens = getStoredTokens();
  if (!tokens) return null;
  return {
    name: tokens.account_name || '',
    email: tokens.account_email || '',
  };
}

export function isConnected(): boolean {
  return getStoredTokens() !== null;
}

export function disconnect(): void {
  clearTokens();
}
