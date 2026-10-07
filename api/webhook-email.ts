import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, ensureTables } from './db';
import { parseNotification, guessCategory, stripHtml } from './bank-parser';
import crypto from 'crypto';

async function fetchEmailContent(emailId: string): Promise<{ html: string; text: string } | null> {
  const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!res.ok) {
    console.error('Resend API error:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return { html: data.html || '', text: data.text || '' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureTables();
    const sql = getDb();
    const body = req.body;

    let from = '';
    let subject = '';
    let htmlBody = '';
    let textBody = '';

    if (body.type === 'email.received' && body.data) {
      from = body.data.from || '';
      subject = body.data.subject || '';
      const emailId = body.data.email_id;
      if (!emailId) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'no email_id' });
      }
      const content = await fetchEmailContent(emailId);
      if (!content) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'could not fetch email content' });
      }
      htmlBody = content.html;
      textBody = content.text;
    } else {
      from = body.from || '';
      subject = body.subject || '';
      htmlBody = body.html || '';
      textBody = body.text || '';
    }

    const emailText = textBody || stripHtml(htmlBody);
    if (!emailText || emailText.length < 20) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'empty body' });
    }

    const parsed = parseNotification(emailText);
    if (!parsed || parsed.monto <= 0) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'not a bank notification' });
    }

    const emailHash = crypto
      .createHash('sha256')
      .update(`${from}:${subject}:${parsed.monto}:${parsed.fecha || ''}`)
      .digest('hex')
      .substring(0, 16);

    const existing = await sql`
      SELECT id FROM email_gastos WHERE email_hash = ${emailHash} LIMIT 1
    `;
    if (existing.length > 0) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'duplicate' });
    }

    const categoria = parsed.comercio ? guessCategory(parsed.comercio) : null;
    const fecha = parsed.fecha || new Date().toISOString().split('T')[0];

    await sql`
      INSERT INTO email_gastos (email_hash, monto, comercio, fecha, banco, tipo, ultimos4, categoria, from_email, subject)
      VALUES (${emailHash}, ${parsed.monto}, ${parsed.comercio || null}, ${fecha}, ${parsed.banco || null}, ${parsed.tipo || null}, ${parsed.ultimos4 || null}, ${categoria}, ${from}, ${subject})
    `;

    return res.status(200).json({
      ok: true,
      imported: true,
      gasto: {
        monto: parsed.monto,
        comercio: parsed.comercio,
        banco: parsed.banco,
        fecha,
        categoria,
      },
    });
  } catch (err: any) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
