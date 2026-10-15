// Cliente del lector con IA (api/parse-email). Si la IA no esta configurada
// o falla, el que llama usa el lector clasico como respaldo.

import { ParsedTransaction } from './bankParser';

export interface RawEmail {
  id: string;
  from?: string;
  subject?: string;
  body?: string;
}

export interface AIResult extends ParsedTransaction {
  categoria?: string;
}

function apiBase(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

interface AIRow {
  id: string;
  es_gasto?: boolean;
  pendiente?: boolean;
  monto?: number | null;
  comercio?: string | null;
  fecha?: string | null;
  ultimos4?: string | null;
  banco?: string | null;
  referencia?: string | null;
  categoria?: string | null;
}

// Devuelve un mapa id -> resultado. null = IA no disponible (usar respaldo).
// Un id presente con valor null interno significa "no es gasto".
export async function parsearConIA(
  items: RawEmail[]
): Promise<Map<string, AIResult | null> | null> {
  if (items.length === 0) return new Map();
  const out = new Map<string, AIResult | null>();

  const lotes: RawEmail[][] = [];
  for (let i = 0; i < items.length; i += 15) {
    lotes.push(items.slice(i, i + 15));
  }

  // Todos los lotes en paralelo
  const respuestas = await Promise.all(
    lotes.map(async (lote): Promise<AIRow[] | null> => {
      try {
        const res = await fetch(`${apiBase()}/api/parse-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails: lote }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data.results) ? data.results : [];
      } catch {
        return null;
      }
    })
  );

  if (respuestas.some((r) => r === null)) return null;

  for (const rows of respuestas as AIRow[][]) {
    for (const r of rows) {
      if (!r?.id) continue;
      if (!r.es_gasto || !r.monto || r.monto <= 0) {
        out.set(String(r.id), null);
        continue;
      }
      out.set(String(r.id), {
        monto: Number(r.monto),
        comercio: r.comercio || undefined,
        fecha: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha || '') ? (r.fecha as string) : undefined,
        ultimos4: /^\d{4}$/.test(r.ultimos4 || '') ? (r.ultimos4 as string) : undefined,
        banco: r.banco || undefined,
        referencia: r.referencia || undefined,
        pendiente: !!r.pendiente,
        tipo: 'pago',
        categoria: r.categoria || undefined,
      });
    }
    // Ids que la IA no devolvio en este lote: que el llamador use respaldo
  }

  return out;
}
