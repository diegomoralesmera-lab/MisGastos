export interface ParsedTransaction {
  monto: number;
  comercio?: string;
  fecha?: string; // YYYY-MM-DD
  ultimos4?: string;
  banco?: string;
  tipo?: 'compra' | 'transferencia' | 'retiro' | 'pago';
  referencia?: string; // ID/documento que envia el banco
  pendiente?: boolean; // factura emitida pero aun no pagada
}

// Correos publicitarios del banco: nunca son gastos
const MARKETING = /preaprobado|promoci[oó]n|oferta|descuento|invitaci[oó]n|sorteo|felicitaciones|gana\s|te\s+presta|solicita\s+tu/i;
const TRANSACTION_HINT = /d[eé]bito|consumo|compra|transferencia|pago|retiro|transacci[oó]n|cobro|exitos/i;

function extractReferencia(text: string): string | undefined {
  const m =
    text.match(/de la orden\s+([A-Z0-9-]{6,20})\b/i) ||
    text.match(
      /(?:n[uú]mero\s+de\s+)?(?:documento|referencia|orden|comprobante|autorizaci[oó]n)\s*(?:nro\.?|no\.?|#|:)\s*([A-Z0-9][A-Z0-9-]{5,20})\b/i
    );
  return m?.[1];
}

// Los ultimos 4 de la tarjeta, sin confundir con cedula o RUC
function extractUltimos4(n: string): string | undefined {
  const tarjeta =
    n.match(/n[uú]mero de tarjeta[:\s]*[*xX]+\s*(\d{4})/i) ||
    n.match(/tarjeta[^.]{0,30}?termina en[:\s]*[*xX]*\s*(\d{4})/i) ||
    n.match(/(?:Tarjeta|termina en)[:\s]*\*{1,}(\d{4})/i);
  return tarjeta?.[1];
}

// Banco Pichincha - Transferencias y consumos
function parsePichincha(text: string): ParsedTransaction | null {
  const normalized = text.replace(/\s+/g, ' ');

  // Debito exitoso (Pichincha Empresas):
  // "se ha realizado el débito exitoso de USD 400.0 de Pago a Proveedores ... de la orden 2610050FBY0U"
  const debito = normalized.match(
    /d[eé]bito exitoso de (?:USD|\$)\s*([\d.,]+)(?:\s+de\s+(.+?))?(?:\s+de la orden\s+([A-Z0-9-]+))?[,.]/i
  );
  if (debito) {
    return {
      monto: parseAmount(debito[1]),
      comercio: debito[2]?.replace(/\s+con\s+.*$/i, '').trim(),
      ultimos4: extractUltimos4(normalized),
      banco: 'Pichincha',
      tipo: 'pago',
      referencia: debito[3] || extractReferencia(normalized),
    };
  }

  // Pago exitoso con tarjeta de debito:
  // "Monto $ 5.68 Comercio CORPDESFA Fecha 11/08/2026 Número de tarjeta ************0498"
  if (/pago(?:\s+\w+)?\s+exitos/i.test(normalized) && /pichincha/i.test(normalized)) {
    const monto = normalized.match(/Monto[:\s]*\$?\s*([\d.,]+)/i);
    const comercio = normalized.match(/Comercio[:\s]+(.+?)(?:\s+(?:Fecha|N[uú]mero|Monto|$))/i);
    const fecha = normalized.match(/Fecha[:\s]+([\d/\-]+)/i);
    if (monto) {
      return {
        monto: parseAmount(monto[1]),
        comercio: comercio?.[1]?.trim(),
        fecha: parseDate(fecha?.[1]),
        ultimos4: extractUltimos4(normalized),
        banco: 'Pichincha',
        tipo: 'compra',
        referencia: extractReferencia(normalized),
      };
    }
  }

  // Transferencia exitosa - real Pichincha email format
  if (/transferencia exitosa/i.test(normalized)) {
    const monto = normalized.match(/Monto[:\s]+\$?([\d.,]+)/i);
    const concepto = normalized.match(/Concepto[:\s]+(.+?)(?:\s+Cuenta|\s*$)/i);
    const fecha = normalized.match(/Fecha[:\s]+([\d/]+)/i);
    const cuentaOrigen = normalized.match(/Cuenta de origen[^*]*(\*{2,}\d{4})/i);
    const nombreDestino = normalized.match(/Cuenta destino[^N]*Nombre[:\s]+(.+?)(?:\s+N[uú]mero)/i);
    const cuentaDestino = normalized.match(/Cuenta destino[^*]*(\*{2,}\d{4})/i);

    if (monto) {
      const comercioText = nombreDestino?.[1]?.trim() || concepto?.[1]?.trim();
      const ultimos4Origen = cuentaOrigen?.[1]?.replace(/\*/g, '').slice(-4);
      return {
        monto: parseAmount(monto[1]),
        comercio: comercioText,
        fecha: parseDate(fecha?.[1]),
        ultimos4: ultimos4Origen,
        banco: 'Pichincha',
        tipo: 'transferencia',
      };
    }
  }

  // Consumo/Compra con tarjeta
  if (/consumo|compra|transacci[oó]n/i.test(normalized)) {
    const monto = normalized.match(/(?:Monto|Valor|USD)[:\s]*\$?([\d.,]+)/i);
    const comercio = normalized.match(/(?:Comercio|Establecimiento|Concepto)[:\s]+(.+?)(?:\s+(?:Tarjeta|Fecha|Monto|$))/i);
    const fecha = normalized.match(/Fecha[:\s]+([\d/\-]+)/i);
    const tarjeta = normalized.match(/(?:Tarjeta|termina en)[:\s]*\*{0,}(\d{4})/i);
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

  // Generic Pichincha fallback (nunca sobre correos publicitarios)
  const montoGeneric = normalized.match(/(?:Monto|Valor|USD)[:\s]*\$?([\d.,]+)/i);
  if (montoGeneric && /pichincha/i.test(normalized) && !MARKETING.test(normalized) && TRANSACTION_HINT.test(normalized)) {
    const concepto = normalized.match(/(?:Concepto|Comercio|Descripci[oó]n)[:\s]+(.+?)(?:\s+(?:Cuenta|Tarjeta|Fecha|Documento|$))/i);
    const fecha = normalized.match(/Fecha[:\s]+([\d/\-]+)/i);
    return {
      monto: parseAmount(montoGeneric[1]),
      comercio: concepto?.[1]?.trim(),
      fecha: parseDate(fecha?.[1]),
      ultimos4: extractUltimos4(normalized),
      banco: 'Pichincha',
      tipo: 'compra',
      referencia: extractReferencia(normalized),
    };
  }

  return null;
}

// Banco de Guayaquil
function parseGuayaquil(text: string): ParsedTransaction | null {
  const normalized = text.replace(/\s+/g, ' ');
  if (!/guayaquil/i.test(normalized)) return null;

  const monto = normalized.match(/(?:Monto|Valor|USD)[:\s]*\$?([\d.,]+)/i);
  const comercio = normalized.match(/(?:Comercio|Establecimiento|Descripci[oó]n)[:\s]+(.+?)(?:\s+(?:Tarjeta|Fecha|Monto|Valor|$))/i);
  const fecha = normalized.match(/Fecha[:\s]+([\d/\-]+)/i);
  const tarjeta = normalized.match(/(?:Tarjeta|termina en)[:\s]*\*{0,}(\d{4})/i);

  if (monto) {
    return {
      monto: parseAmount(monto[1]),
      comercio: comercio?.[1]?.trim(),
      fecha: parseDate(fecha?.[1]),
      ultimos4: tarjeta?.[1],
      banco: 'Guayaquil',
      tipo: 'compra',
    };
  }
  return null;
}

// Produbanco
function parseProdubanco(text: string): ParsedTransaction | null {
  const normalized = text.replace(/\s+/g, ' ');
  if (!/produbanco/i.test(normalized)) return null;

  const monto = normalized.match(/(?:Monto|Valor|USD)[:\s]*\$?([\d.,]+)/i);
  const comercio = normalized.match(/(?:Comercio|Establecimiento|Descripci[oó]n)[:\s]+(.+?)(?:\s+(?:Tarjeta|Fecha|Monto|Valor|$))/i);
  const fecha = normalized.match(/Fecha[:\s]+([\d/\-]+)/i);
  const tarjeta = normalized.match(/(?:Tarjeta|termina en)[:\s]*\*{0,}(\d{4})/i);

  if (monto) {
    return {
      monto: parseAmount(monto[1]),
      comercio: comercio?.[1]?.trim(),
      fecha: parseDate(fecha?.[1]),
      ultimos4: tarjeta?.[1],
      banco: 'Produbanco',
      tipo: 'compra',
    };
  }
  return null;
}

// Banco del Pacifico
function parsePacifico(text: string): ParsedTransaction | null {
  const normalized = text.replace(/\s+/g, ' ');
  if (!/pac[ií]fico/i.test(normalized)) return null;

  const monto = normalized.match(/(?:Monto|Valor|USD)[:\s]*\$?([\d.,]+)/i);
  const comercio = normalized.match(/(?:Comercio|Establecimiento|Descripci[oó]n)[:\s]+(.+?)(?:\s+(?:Tarjeta|Fecha|Monto|Valor|$))/i);
  const fecha = normalized.match(/Fecha[:\s]+([\d/\-]+)/i);
  const tarjeta = normalized.match(/(?:Tarjeta|termina en)[:\s]*\*{0,}(\d{4})/i);

  if (monto) {
    return {
      monto: parseAmount(monto[1]),
      comercio: comercio?.[1]?.trim(),
      fecha: parseDate(fecha?.[1]),
      ultimos4: tarjeta?.[1],
      banco: 'Pacifico',
      tipo: 'compra',
    };
  }
  return null;
}

// Banco del Austro
function parseAustro(text: string): ParsedTransaction | null {
  const normalized = text.replace(/\s+/g, ' ');
  if (!/austro/i.test(normalized)) return null;

  const monto = normalized.match(/(?:Monto|Valor|USD)[:\s]*\$?([\d.,]+)/i);
  const comercio = normalized.match(/(?:Comercio|Establecimiento|Descripci[oó]n)[:\s]+(.+?)(?:\s+(?:Tarjeta|Fecha|Monto|Valor|$))/i);
  const fecha = normalized.match(/Fecha[:\s]+([\d/\-]+)/i);
  const tarjeta = normalized.match(/(?:Tarjeta|termina en)[:\s]*\*{0,}(\d{4})/i);

  if (monto) {
    return {
      monto: parseAmount(monto[1]),
      comercio: comercio?.[1]?.trim(),
      fecha: parseDate(fecha?.[1]),
      ultimos4: tarjeta?.[1],
      banco: 'Austro',
      tipo: 'compra',
    };
  }
  return null;
}

// Banco Internacional
function parseInternacional(text: string): ParsedTransaction | null {
  const normalized = text.replace(/\s+/g, ' ');
  if (!/internacional/i.test(normalized)) return null;

  const monto = normalized.match(/(?:Monto|Valor|USD)[:\s]*\$?([\d.,]+)/i);
  const comercio = normalized.match(/(?:Comercio|Establecimiento|Descripci[oó]n)[:\s]+(.+?)(?:\s+(?:Tarjeta|Fecha|Monto|Valor|$))/i);
  const fecha = normalized.match(/Fecha[:\s]+([\d/\-]+)/i);
  const tarjeta = normalized.match(/(?:Tarjeta|termina en)[:\s]*\*{0,}(\d{4})/i);

  if (monto) {
    return {
      monto: parseAmount(monto[1]),
      comercio: comercio?.[1]?.trim(),
      fecha: parseDate(fecha?.[1]),
      ultimos4: tarjeta?.[1],
      banco: 'Internacional',
      tipo: 'compra',
    };
  }
  return null;
}

// Diners Club
function parseDiners(text: string): ParsedTransaction | null {
  const normalized = text.replace(/\s+/g, ' ');
  if (!/diners/i.test(normalized)) return null;

  const monto = normalized.match(/(?:Monto|Valor|USD)[:\s]*\$?([\d.,]+)/i);
  const comercio = normalized.match(/(?:Comercio|Establecimiento|Descripci[oó]n)[:\s]+(.+?)(?:\s+(?:Tarjeta|Fecha|Monto|Valor|$))/i);
  const fecha = normalized.match(/Fecha[:\s]+([\d/\-]+)/i);
  const tarjeta = normalized.match(/(?:Tarjeta|termina en)[:\s]*\*{0,}(\d{4})/i);

  if (monto) {
    return {
      monto: parseAmount(monto[1]),
      comercio: comercio?.[1]?.trim(),
      fecha: parseDate(fecha?.[1]),
      ultimos4: tarjeta?.[1],
      banco: 'Diners',
      tipo: 'compra',
    };
  }
  return null;
}

// Generic parser - tries to extract amount and details from any bank text
function parseGeneric(text: string): ParsedTransaction | null {
  const normalized = text.replace(/\s+/g, ' ');

  // Solo correos que hablan de una transaccion real, nunca publicidad
  if (MARKETING.test(normalized) || !TRANSACTION_HINT.test(normalized)) return null;

  // Look for monetary amounts
  const montoPatterns = [
    /(?:Monto|Valor|Total|USD|Amount)[:\s]*\$?([\d.,]+)/i,
    /\$\s*([\d.,]+)/,
    /USD\s*([\d.,]+)/i,
  ];

  let monto: number | null = null;
  for (const pattern of montoPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      monto = parseAmount(match[1]);
      if (monto > 0) break;
    }
  }

  if (!monto || monto <= 0) return null;

  const comercio = normalized.match(/(?:Comercio|Establecimiento|Concepto|Descripci[oó]n)[:\s]+(.+?)(?:\s+(?:Tarjeta|Fecha|Monto|Valor|Cuenta|$))/i);
  const fecha = normalized.match(/Fecha[:\s]+([\d/\-]+)/i);
  const tarjeta = normalized.match(/(?:Tarjeta|termina en)[:\s]*\*{0,}(\d{4})/i);

  return {
    monto,
    comercio: comercio?.[1]?.trim(),
    fecha: parseDate(fecha?.[1]),
    ultimos4: tarjeta?.[1],
    tipo: 'compra',
  };
}

function parseAmount(raw: string): number {
  // Handle formats: "1,234.56" or "1.234,56"
  const cleaned = raw.replace(/\s/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      // European: 1.234,56
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    // US: 1,234.56
    return parseFloat(cleaned.replace(/,/g, ''));
  }
  if (cleaned.includes(',') && cleaned.split(',')[1]?.length === 2) {
    // Decimal comma: 25,66
    return parseFloat(cleaned.replace(',', '.'));
  }
  return parseFloat(cleaned.replace(/,/g, ''));
}

function parseDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim();

  // DD/MM/YYYY
  const dmy = cleaned.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // YYYY-MM-DD
  const ymd = cleaned.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  return undefined;
}

export function parseNotification(text: string): ParsedTransaction | null {
  const parsers = [
    parsePichincha,
    parseGuayaquil,
    parseProdubanco,
    parsePacifico,
    parseAustro,
    parseInternacional,
    parseDiners,
    parseGeneric,
  ];

  for (const parser of parsers) {
    const result = parser(text);
    if (result && result.monto > 0) return result;
  }

  return null;
}
