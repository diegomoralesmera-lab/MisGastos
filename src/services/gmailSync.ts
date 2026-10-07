import { getAccessToken } from './googleAuth';
import { parseNotification, ParsedTransaction } from '../utils/bankParser';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

const BANK_SENDERS = [
  'alertas@pichincha.com',
  'notificaciones@pichincha.com',
  'alertas@bancoguayaquil.com',
  'notificaciones@produbanco.com',
  'alertas@pacifico.com.ec',
  'notificaciones@austro.com.ec',
  'alertas@internacional.com.ec',
  'notificaciones@dinersclub.com.ec',
];

export interface GmailTransaction {
  emailId: string;
  subject: string;
  from: string;
  receivedDate: string;
  parsed: ParsedTransaction;
}

function getImportedIds(): Set<string> {
  try {
    const raw = localStorage.getItem('misgastos_imported_gmail');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function markAsImported(ids: string[]): void {
  const existing = getImportedIds();
  ids.forEach((id) => existing.add(id));
  localStorage.setItem('misgastos_imported_gmail', JSON.stringify([...existing]));
}

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    return atob(base64);
  }
}

function extractBody(payload: any): string {
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/html') return stripHtml(decoded);
    return decoded;
  }

  if (payload.parts) {
    // Prefer text/plain, fallback to text/html
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);

    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) return stripHtml(decodeBase64Url(htmlPart.body.data));

    // Nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }

  return '';
}

export async function fetchBankEmails(daysBack = 7): Promise<GmailTransaction[]> {
  const token = await getAccessToken();
  const importedIds = getImportedIds();

  const fromQuery = BANK_SENDERS.map((s) => `from:${s}`).join(' OR ');
  const afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - daysBack);
  const after = Math.floor(afterDate.getTime() / 1000);

  const searchQuery = `(${fromQuery}) after:${after}`;

  const listRes = await fetch(
    `${GMAIL_API}/messages?q=${encodeURIComponent(searchQuery)}&maxResults=20`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!listRes.ok) {
    if (listRes.status === 401) throw new Error('TOKEN_EXPIRED');
    throw new Error('Error al buscar correos');
  }

  const listData = await listRes.json();
  if (!listData.messages?.length) return [];

  const transactions: GmailTransaction[] = [];

  for (const msg of listData.messages) {
    if (importedIds.has(msg.id)) continue;

    const msgRes = await fetch(`${GMAIL_API}/messages/${msg.id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!msgRes.ok) continue;

    const msgData = await msgRes.json();
    const headers = msgData.payload?.headers || [];
    const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
    const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
    const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';

    const body = extractBody(msgData.payload);
    if (!body) continue;

    const parsed = parseNotification(body);
    if (!parsed || parsed.monto <= 0) continue;

    transactions.push({
      emailId: msg.id,
      subject,
      from: from.replace(/<[^>]+>/g, '').trim(),
      receivedDate: date ? new Date(date).toISOString() : new Date().toISOString(),
      parsed,
    });
  }

  return transactions;
}
