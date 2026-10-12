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

  const comercio =
    fromName?.replace(/["']/g, '').replace(/\s+(inc\.?|llc|gmbh|pbc|ltd\.?|s\.?a\.?)$/i, '').trim() ||
    fromEmail?.split('@')[1]?.split('.')[0] ||
    'Servicio';

  return {
    monto,
    comercio,
    tipo: 'pago',
  };
}
