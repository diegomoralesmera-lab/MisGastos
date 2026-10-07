import { getAccessToken } from './microsoftAuth';
import { parseNotification, ParsedTransaction } from '../utils/bankParser';

const GRAPH_URL = 'https://graph.microsoft.com/v1.0';
const IMPORTED_KEY = 'imported_email_ids';

export interface EmailTransaction {
  emailId: string;
  subject: string;
  from: string;
  receivedDate: string;
  bodyPreview: string;
  parsed: ParsedTransaction;
}

function getImportedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(IMPORTED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function markAsImported(emailIds: string[]): void {
  const ids = getImportedIds();
  emailIds.forEach((id) => ids.add(id));
  try {
    localStorage.setItem(IMPORTED_KEY, JSON.stringify([...ids]));
  } catch {}
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|td|th|li|h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#?\w+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchBankEmails(
  daysBack: number = 30
): Promise<EmailTransaction[]> {
  const token = await getAccessToken();

  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const searchTerms = [
    'transferencia',
    'consumo',
    'compra',
    'débito',
    'monto',
    'tarjeta',
  ];

  const url = new URL(`${GRAPH_URL}/me/messages`);
  url.searchParams.set(
    '$filter',
    `receivedDateTime ge ${since.toISOString()}`
  );
  url.searchParams.set('$search', `"${searchTerms.join('" OR "')}"`);
  url.searchParams.set(
    '$select',
    'id,subject,from,bodyPreview,body,receivedDateTime'
  );
  url.searchParams.set('$top', '50');
  url.searchParams.set('$orderby', 'receivedDateTime desc');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('TOKEN_EXPIRED');
    throw new Error(`Error del servidor: ${response.status}`);
  }

  const data = await response.json();
  const importedIds = getImportedIds();
  const results: EmailTransaction[] = [];

  for (const msg of data.value || []) {
    if (importedIds.has(msg.id)) continue;

    const bodyText =
      msg.body?.contentType === 'html'
        ? stripHtml(msg.body.content || '')
        : msg.body?.content || msg.bodyPreview || '';

    const parsed = parseNotification(bodyText);
    if (!parsed || parsed.monto <= 0) continue;

    results.push({
      emailId: msg.id,
      subject: msg.subject || '',
      from:
        msg.from?.emailAddress?.name ||
        msg.from?.emailAddress?.address ||
        '',
      receivedDate: msg.receivedDateTime || '',
      bodyPreview: (msg.bodyPreview || '').substring(0, 100),
      parsed,
    });
  }

  return results;
}
