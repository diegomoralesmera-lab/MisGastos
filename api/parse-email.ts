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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
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
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start) {
      return res.status(502).json({ error: 'respuesta-invalida' });
    }
    const results = JSON.parse(text.slice(start, end + 1));
    return res.status(200).json({ results });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'ai-error' });
  }
}
