export interface ParsedTransaction {
  monto: number;
  comercio?: string;
  fecha?: string;
  ultimos4?: string;
  banco?: string;
  tipo?: 'compra' | 'transferencia' | 'retiro' | 'pago';
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Comida: ['restaurant', 'comida', 'food', 'pizza', 'burger', 'cafe', 'coffee', 'kfc', 'mcdonald'],
  Transporte: ['uber', 'taxi', 'cabify', 'gasolina', 'gas', 'peaje', 'riocargo', 'courier', 'envio', 'express'],
  Supermercado: ['supermaxi', 'megamaxi', 'tia', 'coral', 'supermercado', 'market', 'gran aki', 'santa maria'],
  Salud: ['farmacia', 'hospital', 'clinica', 'medic', 'dental', 'optic', 'fybeca', 'sana sana'],
  Educacion: ['school', 'colegio', 'universidad', 'homeschool', 'educacion', 'curso', 'academy'],
  Ropa: ['zara', 'h&m', 'ropa', 'fashion', 'shoe', 'zapato', 'calzado'],
  Entretenimiento: ['netflix', 'spotify', 'cine', 'cinema', 'juego', 'game', 'play'],
  Servicios: ['electrica', 'agua', 'telefon', 'internet', 'cnt', 'claro', 'movistar', 'light'],
  Suscripciones: ['subscription', 'suscripcion', 'premium', 'plan', 'mensual', 'annual'],
  Hogar: ['ferreteria', 'mueble', 'hogar', 'casa', 'home', 'ikea'],
  Viajes: ['hotel', 'vuelo', 'flight', 'airbnb', 'booking', 'viaje', 'travel'],
};

export function guessCategory(comercio: string): string | null {
  const lower = comercio.toLowerCase();
  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return catName;
  }
  return null;
}

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

function parseDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim();
  const dmy = cleaned.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const ymd = cleaned.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  return undefined;
}

function parsePichincha(text: string): ParsedTransaction | null {
  const n = text.replace(/\s+/g, ' ');
  if (/transferencia exitosa/i.test(n)) {
    const monto = n.match(/Monto[:\s]+\$?([\d.,]+)/i);
    const concepto = n.match(/Concepto[:\s]+(.+?)(?:\s+Cuenta|\s*$)/i);
    const fecha = n.match(/Fecha[:\s]+([\d/]+)/i);
    const cuentaOrigen = n.match(/Cuenta de origen[^*]*(\*{2,}\d{4})/i);
    const nombreDestino = n.match(/Cuenta destino[^N]*Nombre[:\s]+(.+?)(?:\s+N[uú]mero)/i);
    if (monto) {
      return {
        monto: parseAmount(monto[1]),
        comercio: nombreDestino?.[1]?.trim() || concepto?.[1]?.trim(),
        fecha: parseDate(fecha?.[1]),
        ultimos4: cuentaOrigen?.[1]?.replace(/\*/g, '').slice(-4),
        banco: 'Pichincha',
        tipo: 'transferencia',
      };
    }
  }
  if (/consumo|compra|transacci[oó]n/i.test(n)) {
    const monto = n.match(/(?:Monto|Valor|USD)[:\s]*\$?([\d.,]+)/i);
    const comercio = n.match(/(?:Comercio|Establecimiento|Concepto)[:\s]+(.+?)(?:\s+(?:Tarjeta|Fecha|Monto|$))/i);
    const fecha = n.match(/Fecha[:\s]+([\d/\-]+)/i);
    const tarjeta = n.match(/(?:Tarjeta|termina en)[:\s]*\*{0,}(\d{4})/i);
    if (monto) {
      return {
        monto: parseAmount(monto[1]),
        comercio: comercio?.[1]?.trim(),
        fecha: parseDate(fecha?.[1]),
        ultimos4: tarjeta?.[1],
        banco: 'Pichincha',
        tipo: 'compra',
      };
    }
  }
  const m = n.match(/(?:Monto|Valor|USD)[:\s]*\$?([\d.,]+)/i);
  if (m && /pichincha/i.test(n)) {
    const concepto = n.match(/(?:Concepto|Comercio|Descripci[oó]n)[:\s]+(.+?)(?:\s+(?:Cuenta|Tarjeta|Fecha|Documento|$))/i);
    const fecha = n.match(/Fecha[:\s]+([\d/\-]+)/i);
    const tarjeta = n.match(/(\d{4})\s*$/m) || n.match(/termina en[:\s]*\*{0,}(\d{4})/i);
    return {
      monto: parseAmount(m[1]),
      comercio: concepto?.[1]?.trim(),
      fecha: parseDate(fecha?.[1]),
      ultimos4: tarjeta?.[1],
      banco: 'Pichincha',
      tipo: 'compra',
    };
  }
  return null;
}

function parseBankGeneric(text: string, bankName: string, bankPattern: RegExp): ParsedTransaction | null {
  const n = text.replace(/\s+/g, ' ');
  if (!bankPattern.test(n)) return null;
  const monto = n.match(/(?:Monto|Valor|USD)[:\s]*\$?([\d.,]+)/i);
  const comercio = n.match(/(?:Comercio|Establecimiento|Descripci[oó]n)[:\s]+(.+?)(?:\s+(?:Tarjeta|Fecha|Monto|Valor|$))/i);
  const fecha = n.match(/Fecha[:\s]+([\d/\-]+)/i);
  const tarjeta = n.match(/(?:Tarjeta|termina en)[:\s]*\*{0,}(\d{4})/i);
  if (monto) {
    return {
      monto: parseAmount(monto[1]),
      comercio: comercio?.[1]?.trim(),
      fecha: parseDate(fecha?.[1]),
      ultimos4: tarjeta?.[1],
      banco: bankName,
      tipo: 'compra',
    };
  }
  return null;
}

function parseGeneric(text: string): ParsedTransaction | null {
  const n = text.replace(/\s+/g, ' ');
  const patterns = [
    /(?:Monto|Valor|Total|USD|Amount)[:\s]*\$?([\d.,]+)/i,
    /\$\s*([\d.,]+)/,
    /USD\s*([\d.,]+)/i,
  ];
  let monto: number | null = null;
  for (const p of patterns) {
    const match = n.match(p);
    if (match) { monto = parseAmount(match[1]); if (monto > 0) break; }
  }
  if (!monto || monto <= 0) return null;
  const comercio = n.match(/(?:Comercio|Establecimiento|Concepto|Descripci[oó]n)[:\s]+(.+?)(?:\s+(?:Tarjeta|Fecha|Monto|Valor|Cuenta|$))/i);
  const fecha = n.match(/Fecha[:\s]+([\d/\-]+)/i);
  const tarjeta = n.match(/(?:Tarjeta|termina en)[:\s]*\*{0,}(\d{4})/i);
  return { monto, comercio: comercio?.[1]?.trim(), fecha: parseDate(fecha?.[1]), ultimos4: tarjeta?.[1], tipo: 'compra' };
}

export function parseNotification(text: string): ParsedTransaction | null {
  const parsers: Array<(t: string) => ParsedTransaction | null> = [
    parsePichincha,
    (t) => parseBankGeneric(t, 'Guayaquil', /guayaquil/i),
    (t) => parseBankGeneric(t, 'Produbanco', /produbanco/i),
    (t) => parseBankGeneric(t, 'Pacifico', /pac[ií]fico/i),
    (t) => parseBankGeneric(t, 'Austro', /austro/i),
    (t) => parseBankGeneric(t, 'Internacional', /internacional/i),
    (t) => parseBankGeneric(t, 'Diners', /diners/i),
    parseGeneric,
  ];
  for (const parser of parsers) {
    const result = parser(text);
    if (result && result.monto > 0) return result;
  }
  return null;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
