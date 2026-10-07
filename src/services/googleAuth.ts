const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';
const STORAGE_KEY = 'misgastos_google';

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  email?: string;
}

function getRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin + '/gasto/sync';
}

function getStoredConfig(): { clientId: string } | null {
  try {
    const raw = localStorage.getItem('misgastos_google_config');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setClientId(clientId: string): void {
  localStorage.setItem('misgastos_google_config', JSON.stringify({ clientId }));
}

export function getClientId(): string {
  return getStoredConfig()?.clientId || '';
}

function getTokens(): GoogleTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveTokens(tokens: GoogleTokens): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function isConnected(): boolean {
  const tokens = getTokens();
  return !!tokens?.access_token;
}

export function getAccount(): { email: string } | null {
  const tokens = getTokens();
  if (!tokens?.email) return null;
  return { email: tokens.email };
}

export function disconnect(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// PKCE helpers
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function startLogin(): Promise<void> {
  const config = getStoredConfig();
  if (!config?.clientId) throw new Error('NO_CLIENT_ID');

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  sessionStorage.setItem('google_code_verifier', codeVerifier);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });

  window.location.href = `${GOOGLE_AUTH_URL}?${params}`;
}

export async function handleCallback(code: string): Promise<void> {
  const config = getStoredConfig();
  if (!config?.clientId) throw new Error('NO_CLIENT_ID');

  const codeVerifier = sessionStorage.getItem('google_code_verifier');
  if (!codeVerifier) throw new Error('NO_CODE_VERIFIER');

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri(),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || 'Token exchange failed');
  }

  const data = await res.json();
  const tokens: GoogleTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  // Get user email
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (profileRes.ok) {
    const profile = await profileRes.json();
    tokens.email = profile.email;
  }

  saveTokens(tokens);
  sessionStorage.removeItem('google_code_verifier');
}

export async function getAccessToken(): Promise<string> {
  const tokens = getTokens();
  if (!tokens) throw new Error('NOT_SIGNED_IN');

  if (Date.now() < tokens.expires_at - 60000) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) throw new Error('TOKEN_EXPIRED');

  const config = getStoredConfig();
  if (!config?.clientId) throw new Error('NO_CLIENT_ID');

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) throw new Error('TOKEN_REFRESH_FAILED');

  const data = await res.json();
  tokens.access_token = data.access_token;
  tokens.expires_at = Date.now() + data.expires_in * 1000;
  saveTokens(tokens);

  return tokens.access_token;
}
