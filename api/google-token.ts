import type { VercelRequest, VercelResponse } from '@vercel/node';

// Exchanges a Google OAuth authorization code (or refresh token) for tokens.
// The client secret lives only here, server-side.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Google OAuth not configured' });
  }

  const { code, redirectUri, refreshToken } = req.body || {};

  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
  if (code) {
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', redirectUri || '');
  } else if (refreshToken) {
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', refreshToken);
  } else {
    return res.status(400).json({ error: 'code or refreshToken required' });
  }

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(400).json({ error: data.error_description || data.error || 'Token exchange failed' });
    }
    return res.status(200).json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      id_token: data.id_token,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
