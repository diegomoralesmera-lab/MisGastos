import { neon } from '@neondatabase/serverless';

export function getDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return sql;
}

export async function ensureTables() {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS email_gastos (
      id SERIAL PRIMARY KEY,
      email_hash TEXT NOT NULL,
      monto NUMERIC(10,2) NOT NULL,
      comercio TEXT,
      fecha DATE NOT NULL DEFAULT CURRENT_DATE,
      banco TEXT,
      tipo TEXT,
      ultimos4 TEXT,
      categoria TEXT,
      from_email TEXT,
      subject TEXT,
      imported BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_email_gastos_imported
    ON email_gastos(imported)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_email_gastos_hash
    ON email_gastos(email_hash)
  `;
}
