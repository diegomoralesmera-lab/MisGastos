import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// Lee correos con Claude y devuelve transacciones estructuradas.
// La clave de API vive solo aqui, en el servidor.

const CATEGORIAS = [
  'Comida',
  'Transporte',
  'Supermercado',
  'Salud',
  'Educacion',
  'Entretenimiento',
  'Hogar',
  'Ropa',
  'Servicios',
  'Suscripciones',
  'Viajes',
  'Otro',
];

const SYSTEM = `Eres el motor de extraccion de una app de finanzas personales de Ecuador.
Recibes una lista de correos (id, remitente, asunto, cuerpo) y devuelves SOLO un array JSON, sin texto adicional.

Para cada correo devuelve un objeto:
{
  "id": "<el mismo id>",
  "es_gasto": true | false,       // true solo si representa dinero del usuario saliendo (cobro, debito, pago realizado, recibo pagado, factura de una compra ya hecha)
  "pendiente": true | false,      // true si es una factura/cobro POR PAGAR (aun no se ha pagado: "amount due", "open invoice", link de pago, recordatorio)
  "monto": 12.34 | null,          // numero, sin simbolo. null si no hay monto en el texto
  "moneda": "USD" | "EUR" | ...,
  "comercio": "nombre limpio del comercio o servicio (ej: 'Claude (Anthropic)', 'PedidosYa', 'CORPDESFA')",
  "fecha": "YYYY-MM-DD" | null,   // fecha de la transaccion si aparece en el texto
  "ultimos4": "1234" | null,      // SOLO los 4 digitos de la TARJETA usada. Nunca cedula, RUC ni numero de cuenta
  "banco": "Pichincha" | "Guayaquil" | ... | null,  // solo si el correo viene de un banco
  "referencia": "id de la orden/recibo/factura" | null,
  "categoria": una de [${CATEGORIAS.join(', ')}]
}

Reglas estrictas:
- Publicidad, promociones, creditos preaprobados, avisos de seguridad/login, codigos de verificacion, newsletters: es_gasto=false.
- Una notificacion de debito o pago exitoso del banco: es_gasto=true, pendiente=false.
- Una factura emitida sin evidencia de pago: es_gasto=true, pendiente=true.
- Un recibo que dice "paid"/"pagado": es_gasto=true, pendiente=false.
- Transferencias enviadas y retiros cuentan como gasto.
- Depositos, ingresos o reembolsos recibidos: es_gasto=false.
- Si dudas del monto, usa null en vez de inventar.`;

interface EmailIn {
  id: string;
  from?: string;
  subject?: string;
  body?: string;
}

// Modelos gratis de OpenRouter, en orden de preferencia (la API prueba
// el siguiente si uno falla o esta saturado)
const OPENROUTER_FREE_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];

function extraerJSON(text: string): unknown[] | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function conOpenRouter(payload: unknown): Promise<unknown[] | null> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://misgastos-seven.vercel.app',
      'X-Title': 'MisGastos',
    },
    body: JSON.stringify({
      models: OPENROUTER_FREE_MODELS,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  return extraerJSON(text);
}

async function conClaude(payload: unknown): Promise<unknown[] | null> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 8000,
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
  });
  let text = '';
  for (const block of response.content) {
    if (block.type === 'text') text += block.text;
  }
  return extraerJSON(text);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const tieneOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const tieneClaude = !!process.env.ANTHROPIC_API_KEY;
  if (!tieneOpenRouter && !tieneClaude) {
    return res.status(503).json({ error: 'ai-not-configured' });
  }

  const emails: EmailIn[] = Array.isArray(req.body?.emails) ? req.body.emails : [];
  if (emails.length === 0 || emails.length > 20) {
    return res.status(400).json({ error: 'emails: 1-20 requeridos' });
  }

  const payload = emails.map((e) => ({
    id: String(e.id).slice(0, 200),
    from: String(e.from || '').slice(0, 200),
    subject: String(e.subject || '').slice(0, 300),
    body: String(e.body || '').slice(0, 2500),
  }));

  try {
    let results: unknown[] | null = null;
    if (tieneOpenRouter) {
      results = await conOpenRouter(payload);
    }
    if (!results && tieneClaude) {
      results = await conClaude(payload);
    }
    if (!results) {
      return res.status(502).json({ error: 'respuesta-invalida' });
    }
    return res.status(200).json({ results });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'ai-error' });
  }
}
