// Busca correos de bancos en Gmail (Gmail API) y extrae los gastos
// con el mismo parser del resto de la app.

import { EmailGasto, Candidato, extraerGastos } from './outlookMail';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

const QUERIES = [
  'pichincha OR guayaquil OR produbanco OR pacifico OR austro OR diners OR "banco internacional"',
  'receipt OR invoice OR factura OR recibo OR "amount paid" OR "payment confirmation" OR "tu pago"',
];

function base64urlDecode(data: string): string {
  try {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = atob(b64);
    // Decode UTF-8
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new TextDecoder('utf-8').decode(arr);
  } catch {
    return '';
  }
}

function htmlToText(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
    } catch {}
  }
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function extractBody(part: GmailPart): string {
  if (part.body?.data) {
    const text = base64urlDecode(part.body.data);
    return part.mimeType?.includes('html') ? htmlToText(text) : text;
  }
  for (const sub of part.parts || []) {
    const text = extractBody(sub);
    if (text) return text;
  }
  return '';
}

export async function buscarGastosEnGmail(
  token: string,
  desde: Date,
  skipIds: Set<string>
): Promise<EmailGasto[]> {
  const after = `${desde.getFullYear()}/${desde.getMonth() + 1}/${desde.getDate()}`;
  const candidatos = new Map<string, Candidato>();

  for (const terms of QUERIES) {
    const q = `(${terms}) after:${after}`;
    const listUrl = `${GMAIL}/messages?q=${encodeURIComponent(q)}&maxResults=50`;

    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (listRes.status === 401 || listRes.status === 403) throw new Error('UNAUTHORIZED');
    if (!listRes.ok) continue;
    const list = await listRes.json();

    for (const ref of list.messages || []) {
      if (!ref.id || skipIds.has(ref.id) || candidatos.has(ref.id)) continue;
      let msgRes: Response;
      try {
        msgRes = await fetch(`${GMAIL}/messages/${ref.id}?format=full`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        continue;
      }
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();

      const headers: Array<{ name: string; value: string }> = msg.payload?.headers || [];
      const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '';
      const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value || '';
      const fromName = from.split('<')[0].trim();
      const fromEmail = from.match(/<([^>]+)>/)?.[1] || from;
      const receivedAt = new Date(Number(msg.internalDate || Date.now())).toISOString();

      candidatos.set(ref.id, {
        id: ref.id,
        subject,
        body: extractBody(msg.payload || {}),
        from,
        fromName,
        fromEmail,
        receivedAt,
      });
    }
  }

  return extraerGastos([...candidatos.values()]);
}
