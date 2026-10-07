import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureTables } from './db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureTables();
    return res.status(200).json({ ok: true, message: 'Tables created' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
