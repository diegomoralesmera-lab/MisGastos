// Busca correos de bancos en el buzon conectado (Microsoft Graph) y
// extrae los gastos con el mismo parser que usa el resto de la app.

import { parseNotification, ParsedTransaction } from './bankParser';
import { parseReceipt } from './receiptParser';

export interface EmailGasto extends ParsedTransaction {
  messageId: string;
  subject: string;
  receivedAt: string;
}

const GRAPH = 'https://graph.microsoft.com/v1.0';

const SEARCH_TERMS = [
  'pichincha',
  'guayaquil',
  'produbanco',
  'pacifico',
  'austro',
  'diners',
  'banco internacional',
  'receipt',
  'invoice',
  'factura',
  'recibo',
];

const IMPORTED_KEY = 'misgastos_msgids_importados';

export function getImportedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(IMPORTED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function clearImportedIds(): void {
  try {
    localStorage.removeItem(IMPORTED_KEY);
  } catch {}
}

export function markImported(ids: string[]): void {
  try {
    const all = getImportedIds();
    ids.forEach((id) => all.add(id));
    // Keep the list bounded
    localStorage.setItem(IMPORTED_KEY, JSON.stringify([...all].slice(-1000)));
  } catch {}
}

function htmlToText(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
    } catch {}
  }
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function buscarGastosEnCorreo(
  token: string,
  desde: Date
): Promise<EmailGasto[]> {
  const found = new Map<string, EmailGasto>();
  const imported = getImportedIds();

  for (const term of SEARCH_TERMS) {
    const url =
      `${GRAPH}/me/messages?$search="${encodeURIComponent(term)}"` +
      `&$top=25&$select=id,subject,receivedDateTime,body,from`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      continue;
    }
    if (res.status === 401) throw new Error('UNAUTHORIZED');
    if (!res.ok) continue;
    const data = await res.json();

    for (const msg of data.value || []) {
      if (!msg.id || found.has(msg.id) || imported.has(msg.id)) continue;
      if (!msg.receivedDateTime || new Date(msg.receivedDateTime) < desde) continue;

      const text = htmlToText(msg.body?.content || '');
      const parsed =
        parseNotification(`${msg.subject || ''}\n${text}`) ||
        parseReceipt(
          msg.subject || '',
          text,
          msg.from?.emailAddress?.name,
          msg.from?.emailAddress?.address
        );
      if (parsed && parsed.monto > 0) {
        found.set(msg.id, {
          ...parsed,
          fecha: parsed.fecha || msg.receivedDateTime.split('T')[0],
          messageId: msg.id,
          subject: msg.subject || '',
          receivedAt: msg.receivedDateTime,
        });
      }
    }
  }

  return [...found.values()].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}
