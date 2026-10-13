// Reconoce recibos y facturas de servicios (Claude, Hetzner, Netflix, etc.)
// que llegan por correo, como complemento del parser de bancos.

import { ParsedTransaction } from './bankParser';

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/\s/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    return parseFloat(cleaned.replace(/,/g, ''));
  }
  if (cleaned.includes(',') && cleaned.split(',')[1]?.length === 2) {
    return parseFloat(cleaned.replace(',', '.'));
  }
  return parseFloat(cleaned.replace(/,/g, ''));
}

const RECEIPT_HINT =
  /receipt|invoice|factura|recibo|payment|pago\s|pagado|paid|charged|cobro|suscripci[oó]n|subscription|billing/i;

// Marcas conocidas: nombre limpio para mostrar como comercio
const BRANDS: Array<[RegExp, string]> = [
  [/anthropic|claude/i, 'Claude (Anthropic)'],
  [/eleven\s*labs/i, 'ElevenLabs'],
  [/hetzner/i, 'Hetzner'],
  [/openrouter/i, 'OpenRouter'],
  [/openai|chatgpt/i, 'OpenAI'],
  [/delivery\s*hero|pedidosya/i, 'PedidosYa'],
  [/netflix/i, 'Netflix'],
  [/spotify/i, 'Spotify'],
  [/github/i, 'GitHub'],
  [/vercel/i, 'Vercel'],
  [/uber/i, 'Uber'],
  [/amazon|amzn/i, 'Amazon'],
  [/paypal/i, 'PayPal'],
  [/apple/i, 'Apple'],
];

function limpiarComercio(fromName?: string, fromEmail?: string, subject?: string): string {
  const contexto = `${subject || ''} ${fromName || ''} ${fromEmail || ''}`;
  for (const [patron, nombre] of BRANDS) {
    if (patron.test(contexto)) return nombre;
  }
  let raw = (fromName || '').trim();
  if (!raw || raw.includes('@')) {
    raw = fromEmail?.split('@')[1]?.split('.')[0] || 'Servicio';
  }
  return raw
    .replace(/^noreply\s*(billing)?\s*[-–—]?\s*/i, '')
    .replace(/["']/g, '')
    .replace(/[,.]+$/, '')
    .replace(/\s+(inc\.?|llc|gmbh|pbc|ltd\.?|s\.?a\.?s?\.?)$/i, '')
    .trim() || 'Servicio';
}

export function parseReceipt(
  subject: string,
  body: string,
  fromName?: string,
  fromEmail?: string
): ParsedTransaction | null {
  const text = `${subject}\n${body}`.replace(/\s+/g, ' ');
  if (!RECEIPT_HINT.test(subject) && !RECEIPT_HINT.test(text.slice(0, 300))) {
    return null;
  }

  // Primero montos con contexto (Total, Amount paid, Importe...)
  const ctx = text.match(
    /(?:total(?:\s+(?:due|paid|pagado|a\s+pagar))?|amount\s+(?:paid|due|charged)|importe|monto|grand\s+total)\s*[:\s]\s*(?:USD|EUR|US\$|\$|€)?\s*([\d][\d.,]*)/i
  );
  // Luego cualquier cantidad con simbolo de moneda
  const plain = text.match(/(?:US\$|\$|€|USD\s?|EUR\s?)\s*([\d][\d.,]*)/);

  const raw = ctx?.[1] || plain?.[1];
  if (!raw) return null;

  const monto = parseAmount(raw);
  if (!monto || !isFinite(monto) || monto <= 0 || monto > 100000) return null;

  // Numero de recibo/factura (debe contener digitos)
  const ref =
    text.match(
      /(?:receipt|invoice|factura|recibo)\s*(?:number|n[uú]mero|nro\.?|no\.?)?\s*[:#]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{5,24})\b/i
    ) || text.match(/invoice\s+(\d{6,})/i);

  // Tarjeta usada ("Payment method - 3886")
  const tarjeta = text.match(/payment\s+method\s*[-–—:]?\s*[*x•\s]*(\d{4})\b/i);

  return {
    monto,
    comercio: limpiarComercio(fromName, fromEmail, subject),
    tipo: 'pago',
    referencia: ref?.[1],
    ultimos4: tarjeta?.[1],
  };
}
