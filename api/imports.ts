import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, ensureTables } from './db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await ensureTables();
    const sql = getDb();

    if (req.method === 'GET') {
      const pending = await sql`
        SELECT id, monto, comercio, fecha, banco, tipo, ultimos4, categoria, created_at
        FROM email_gastos
        WHERE imported = FALSE
        ORDER BY created_at DESC
        LIMIT 50
      `;
      return res.status(200).json({ gastos: pending });
    }

    if (req.method === 'POST') {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids array required' });
      }
      await sql`
        UPDATE email_gastos SET imported = TRUE WHERE id = ANY(${ids})
      `;
      return res.status(200).json({ ok: true, marked: ids.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
