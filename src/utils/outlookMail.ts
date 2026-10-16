// Busca correos de bancos en el buzon conectado (Microsoft Graph) y
// extrae los gastos con el mismo parser que usa el resto de la app.

import { parseNotification, ParsedTransaction } from './bankParser';
import { parseReceipt } from './receiptParser';
import { parsearConIA } from './aiParser';

export interface EmailGasto extends ParsedTransaction {
  messageId: string;
  subject: string;
  receivedAt: string;
  categoria?: string; // sugerida por la IA
  enlace?: string; // link para abrir el correo original
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

export interface Candidato {
  id: string;
  subject: string;
  body: string;
  from: string;
  fromName?: string;
  fromEmail?: string;
  receivedAt: string;
  enlace?: string;
}

export async function buscarGastosEnCorreo(
  token: string,
  desde: Date
): Promise<EmailGasto[]> {
  const imported = getImportedIds();
  const candidatos = new Map<string, Candidato>();

  // Fase 1: todas las busquedas en paralelo
  const porTermino = await Promise.all(
    SEARCH_TERMS.map(async (term) => {
      const url =
        `${GRAPH}/me/messages?$search="${encodeURIComponent(term)}"` +
        `&$top=25&$select=id,subject,receivedDateTime,body,from,webLink`;
      let res: Response;
      try {
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      } catch {
        return [];
      }
      if (res.status === 401) throw new Error('UNAUTHORIZED');
      if (!res.ok) return [];
      const data = await res.json();
      return (data.value || []) as any[];
    })
  );

  for (const lote of porTermino) {
    for (const msg of lote) {
      if (!msg.id || candidatos.has(msg.id) || imported.has(msg.id)) continue;
      if (!msg.receivedDateTime || new Date(msg.receivedDateTime) < desde) continue;
      const fromName = msg.from?.emailAddress?.name;
      const fromEmail = msg.from?.emailAddress?.address;
      candidatos.set(msg.id, {
        id: msg.id,
        subject: msg.subject || '',
        body: htmlToText(msg.body?.content || ''),
        from: `${fromName || ''} <${fromEmail || ''}>`,
        fromName,
        fromEmail,
        receivedAt: msg.receivedDateTime,
        enlace: msg.webLink || undefined,
      });
    }
  }

  return extraerGastos([...candidatos.values()]);
}

// Fase 2: IA primero, lector clasico como respaldo
export async function extraerGastos(candidatos: Candidato[]): Promise<EmailGasto[]> {
  const ai = await parsearConIA(
    candidatos.map((c) => ({ id: c.id, from: c.from, subject: c.subject, body: c.body }))
  );

  const found: EmailGasto[] = [];
  for (const c of candidatos) {
    let parsed: (ParsedTransaction & { categoria?: string }) | null | undefined;
    if (ai && ai.has(c.id)) {
      parsed = ai.get(c.id); // null = la IA dijo "no es gasto"
    } else {
      parsed =
        parseNotification(`${c.subject}\n${c.body}`) ||
        parseReceipt(c.subject, c.body, c.fromName, c.fromEmail);
    }
    if (parsed && parsed.monto > 0) {
      found.push({
        ...parsed,
        fecha: parsed.fecha || c.receivedAt.split('T')[0],
        messageId: c.id,
        subject: c.subject,
        receivedAt: c.receivedAt,
        enlace: c.enlace,
      });
    }
  }

  return found.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}
