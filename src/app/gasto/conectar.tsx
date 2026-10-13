import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticSuccess } from '../../hooks/useHaptics';
import { useTheme } from '../../hooks/useColorScheme';
import { getCategorias, insertGasto, deleteGasto, getAllGastos, findOrCreateTarjeta } from '../../db/database';
import { Categoria } from '../../types';
import {
  MS_CLIENT_ID,
  isConnected,
  getConnectedEmail,
  startLogin,
  completeLogin,
  getAccessToken,
  disconnect,
} from '../../utils/outlookAuth';
import {
  EmailGasto,
  buscarGastosEnCorreo,
  markImported,
  getImportedIds,
  clearImportedIds,
} from '../../utils/outlookMail';
import {
  GOOGLE_CLIENT_ID,
  isGoogleConnected,
  getGoogleEmail,
  startGoogleLogin,
  completeGoogleLogin,
  getGoogleAccessToken,
  disconnectGoogle,
} from '../../utils/googleAuth';
import { buscarGastosEnGmail } from '../../utils/gmailMail';

type Step = 'landing' | 'auth' | 'searching' | 'results' | 'importing' | 'done';
type Rango = 'mes' | 'tres';

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Comida: ['restaurant', 'comida', 'food', 'pizza', 'burger', 'cafe', 'coffee', 'kfc', 'mcdonald'],
  Transporte: ['uber', 'taxi', 'cabify', 'gasolina', 'riocargo', 'courier', 'envio', 'express'],
  Supermercado: ['supermaxi', 'megamaxi', 'tia', 'coral', 'supermercado', 'market', 'gran aki'],
  Salud: ['farmacia', 'hospital', 'clinica', 'medic', 'dental', 'fybeca', 'sana sana'],
  Educacion: ['school', 'colegio', 'universidad', 'homeschool', 'educacion', 'curso', 'academy'],
  Servicios: ['electrica', 'agua', 'telefon', 'internet', 'cnt', 'claro', 'movistar', 'hetzner', 'vercel', 'aws', 'hosting', 'dominio', 'domain'],
  Hogar: ['ferreteria', 'mueble', 'hogar', 'casa', 'home'],
  Viajes: ['hotel', 'vuelo', 'flight', 'airbnb', 'booking', 'viaje'],
  Suscripciones: ['claude', 'anthropic', 'openai', 'chatgpt', 'netflix', 'spotify', 'github', 'subscription', 'suscripcion'],
};

function guessCategory(comercio: string, categorias: Categoria[]): number | null {
  const lower = comercio.toLowerCase();
  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      const cat = categorias.find((c) => c.nombre === catName);
      if (cat) return cat.id;
    }
  }
  return null;
}

function diffDias(a?: string, b?: string): number {
  if (!a || !b) return 99;
  const da = new Date(a + 'T12:00:00').getTime();
  const db = new Date(b + 'T12:00:00').getTime();
  if (isNaN(da) || isNaN(db)) return 99;
  return Math.abs(da - db) / 86400000;
}

// El recibo del servicio nunca crea un gasto aparte: si corresponde a un
// cobro del banco (mismo monto, fechas a <=3 dias), se une a el. Es el mismo
// modelo que usan las apps de finanzas con transacciones pendientes/posteadas.
function fusionarRecibosConBanco(lista: EmailGasto[]): {
  resultado: EmailGasto[];
  fusionados: number;
} {
  const bancos = lista.filter((g) => g.banco);
  const quitar = new Set<string>();
  for (const r of lista) {
    if (r.banco) continue;
    const match = bancos.find(
      (b) => Math.abs(b.monto - r.monto) < 0.01 && diffDias(b.fecha, r.fecha) <= 3
    );
    if (match) {
      quitar.add(r.messageId);
      // El recibo enriquece al cobro del banco
      if (!match.ultimos4 && r.ultimos4) match.ultimos4 = r.ultimos4;
      if (!match.referencia && r.referencia) match.referencia = r.referencia;
      if (!match.comercio && r.comercio) match.comercio = r.comercio;
    }
  }
  return { resultado: lista.filter((g) => !quitar.has(g.messageId)), fusionados: quitar.size };
}

// Posibles duplicados restantes: mismo monto y fechas cercanas.
// Dos referencias distintas = transacciones distintas (nunca es duplicado).
function detectarDuplicados(lista: EmailGasto[]): Set<string> {
  const dups = new Set<string>();
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i];
      const b = lista[j];
      if (dups.has(a.messageId) || dups.has(b.messageId)) continue;
      if (a.referencia && b.referencia && a.referencia !== b.referencia) continue;
      if (Math.abs(a.monto - b.monto) < 0.01 && diffDias(a.fecha, b.fecha) <= 2) {
        const recibo = !a.banco ? a : b;
        dups.add(recibo.messageId);
      }
    }
  }
  return dups;
}

function rangoDesde(rango: Rango): Date {
  const now = new Date();
  if (rango === 'mes') return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getFullYear(), now.getMonth() - 2, 1);
}

export default function ConectarScreen() {
  const theme = useTheme();
  const [step, setStep] = useState<Step>('landing');
  const [error, setError] = useState('');
  const [gastos, setGastos] = useState<EmailGasto[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [imported, setImported] = useState(0);
  const [rango, setRango] = useState<Rango>('mes');
  const [posiblesDup, setPosiblesDup] = useState<Set<string>>(new Set());
  const [pendientes, setPendientes] = useState<EmailGasto[]>([]);
  const [fusionados, setFusionados] = useState(0);
  const [msEmail, setMsEmail] = useState<string | null>(null);
  const [gEmail, setGEmail] = useState<string | null>(null);

  const buscar = useCallback(async (r: Rango) => {
    setStep('searching');
    setError('');
    const desde = rangoDesde(r);
    const found: EmailGasto[] = [];
    const seen = new Set<string>();
    const errores: string[] = [];
    let conectado = false;

    // Outlook / Hotmail
    try {
      const token = await getAccessToken();
      if (token) {
        conectado = true;
        for (const g of await buscarGastosEnCorreo(token, desde)) {
          if (!seen.has(g.messageId)) {
            seen.add(g.messageId);
            found.push(g);
          }
        }
      } else {
        setMsEmail(null);
      }
    } catch (err: any) {
      if (err?.message === 'UNAUTHORIZED') {
        disconnect();
        setMsEmail(null);
        errores.push('La sesion de Outlook expiro, conectala de nuevo.');
      } else {
        errores.push('Outlook: ' + (err?.message || 'no se pudo leer'));
      }
    }

    // Gmail
    try {
      const token = await getGoogleAccessToken();
      if (token) {
        conectado = true;
        const skip = getImportedIds();
        for (const g of await buscarGastosEnGmail(token, desde, skip)) {
          if (!seen.has(g.messageId)) {
            seen.add(g.messageId);
            found.push(g);
          }
        }
      } else {
        setGEmail(null);
      }
    } catch (err: any) {
      if (err?.message === 'UNAUTHORIZED') {
        disconnectGoogle();
        setGEmail(null);
        errores.push('La sesion de Gmail expiro, conectala de nuevo.');
      } else {
        errores.push('Gmail: ' + (err?.message || 'no se pudo leer'));
      }
    }

    if (!conectado && errores.length === 0) {
      setStep('landing');
      setError('Conecta tu correo para buscar gastos.');
      return;
    }

    found.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    // 1) Facturas por pagar: no son dinero que ya salio, van aparte
    const porPagar = found.filter((g) => g.pendiente);
    // 2) Recibos que corresponden a cobros del banco: se unen, no se duplican
    const { resultado, fusionados: nFus } = fusionarRecibosConBanco(
      found.filter((g) => !g.pendiente)
    );
    // 3) Lo que quede con mismo monto y fecha cercana: posible duplicado
    const dups = detectarDuplicados(resultado);

    setPendientes(porPagar);
    setFusionados(nFus);
    setPosiblesDup(dups);
    setGastos(resultado);
    setSelected(new Set(resultado.filter((g) => !dups.has(g.messageId)).map((g) => g.messageId)));
    setError(errores.join(' '));
    setStep(conectado ? 'results' : 'landing');
  }, []);

  useEffect(() => {
    (async () => {
      setCategorias(await getCategorias());

      // Volviendo del login de Microsoft o Google con ?code=
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      if (code) {
        setStep('auth');
        window.history.replaceState({}, '', window.location.pathname);
        try {
          if (state === 'google') {
            await completeGoogleLogin(code);
            setGEmail(getGoogleEmail());
          } else {
            await completeLogin(code);
            setMsEmail(getConnectedEmail());
          }
          if (isConnected()) setMsEmail(getConnectedEmail());
          if (isGoogleConnected()) setGEmail(getGoogleEmail());
          await buscar('mes');
        } catch (err: any) {
          setError(err?.message || 'No se pudo conectar');
          setStep('landing');
        }
        return;
      }
      if (params.get('error_description') || params.get('error')) {
        setError(params.get('error_description') || 'Login cancelado');
        window.history.replaceState({}, '', window.location.pathname);
      }

      if (isConnected()) setMsEmail(getConnectedEmail());
      if (isGoogleConnected()) setGEmail(getGoogleEmail());
      if (isConnected() || isGoogleConnected()) {
        await buscar('mes');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConectar = async () => {
    if (!MS_CLIENT_ID) {
      setError('Falta configurar la conexion con Microsoft (client ID).');
      return;
    }
    await startLogin();
  };

  const handleConectarGoogle = () => {
    if (!GOOGLE_CLIENT_ID) {
      setError('Falta configurar la conexion con Google (client ID).');
      return;
    }
    startGoogleLogin();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const cambiarRango = (r: Rango) => {
    setRango(r);
    buscar(r);
  };

  const handleReimportar = () => {
    const ok =
      typeof window === 'undefined' ||
      window.confirm(
        'Se volveran a traer todos los gastos de tus correos. Los que ya existen se actualizaran con su referencia y tarjeta, sin duplicarse. Continuar?'
      );
    if (!ok) return;
    clearImportedIds();
    buscar(rango);
  };

  const handleImportar = async () => {
    const elegidos = gastos.filter((g) => selected.has(g.messageId));
    if (elegidos.length === 0) return;
    setStep('importing');
    let count = 0;
    const existentes = await getAllGastos();
    for (const g of elegidos) {
      try {
        // Si ya existe, se reemplaza (nunca se duplica). Referencias distintas
        // significan transacciones distintas; sin referencias decide monto+fecha.
        const dup = existentes.find((e) => {
          if (g.referencia && e.referencia) return e.referencia === g.referencia;
          return Math.abs(e.monto - g.monto) < 0.005 && diffDias(e.fecha, g.fecha) <= 2;
        });
        if (dup) await deleteGasto(dup.id);

        const tarjetaId = await findOrCreateTarjeta(g.banco, g.ultimos4);
        await insertGasto({
          monto: g.monto,
          fecha: g.fecha || new Date().toISOString().split('T')[0],
          nota: g.banco ? `${g.banco} - ${g.tipo || 'email'}` : g.subject || undefined,
          comercio: g.comercio || undefined,
          referencia: g.referencia,
          tarjetaId,
          categoriaId:
            (g.comercio ? guessCategory(g.comercio, categorias) : null) ||
            categorias.find((c) => c.nombre === 'Otro')?.id ||
            categorias[categorias.length - 1]?.id,
        });
        count++;
      } catch {}
    }
    markImported(elegidos.map((g) => g.messageId));
    setImported(count);
    setStep('done');
    hapticSuccess();
  };

  const handleDesconectar = (provider: 'ms' | 'google') => {
    if (provider === 'ms') {
      disconnect();
      setMsEmail(null);
    } else {
      disconnectGoogle();
      setGEmail(null);
    }
    if (!isConnected() && !isGoogleConnected()) {
      setGastos([]);
      setStep('landing');
    } else {
      buscar(rango);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso + 'T12:00:00').toLocaleDateString('es-EC', {
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return iso;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/')} hitSlop={12}>
          <Ionicons name="close" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>
          {step === 'landing' ? 'Conectar correo' : 'Gastos del correo'}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.danger + '15' }]}>
            <Ionicons name="alert-circle" size={18} color={theme.danger} />
            <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
          </View>
        ) : null}

        {step === 'landing' && (
          <View style={styles.landingBox}>
            <View style={[styles.iconCircle, { backgroundColor: theme.primary + '20' }]}>
              <Ionicons name="mail-unread" size={48} color={theme.primary} />
            </View>
            <Text style={[styles.landingTitle, { color: theme.text }]}>
              Conecta tu correo{'\n'}y listo
            </Text>
            <Text style={[styles.landingSubtitle, { color: theme.textSecondary }]}>
              Inicia sesion con tu cuenta de Outlook, Hotmail o Gmail y la app leera
              los correos de tu banco para registrar tus gastos automaticamente.
              Puedes conectar varias cuentas.
            </Text>
            <View style={styles.featureList}>
              {[
                { icon: 'flash', text: 'Detecta los gastos del mes solos' },
                { icon: 'card', text: 'Crea las tarjetas automaticamente' },
                { icon: 'shield-checkmark', text: 'Tu clave se ingresa solo en Microsoft o Google' },
                { icon: 'eye-off', text: 'Solo permiso de lectura de correo' },
              ].map((f) => (
                <View key={f.icon} style={styles.featureItem}>
                  <Ionicons name={f.icon as any} size={20} color={theme.primary} />
                  <Text style={[styles.featureText, { color: theme.textSecondary }]}>
                    {f.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {(step === 'auth' || step === 'searching') && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              {step === 'auth' ? 'Conectando tu correo...' : 'Leyendo correos del banco...'}
            </Text>
          </View>
        )}

        {step === 'results' && (
          <>
            {([
              { provider: 'ms' as const, email: msEmail, icon: 'logo-microsoft' as const },
              { provider: 'google' as const, email: gEmail, icon: 'logo-google' as const },
            ])
              .filter((a) => a.email)
              .map((a) => (
                <View key={a.provider} style={[styles.accountRow, { backgroundColor: theme.surface }]}>
                  <Ionicons name={a.icon} size={18} color={theme.primary} />
                  <Text style={[styles.accountText, { color: theme.textSecondary }]} numberOfLines={1}>
                    {a.email}
                  </Text>
                  <Pressable onPress={() => handleDesconectar(a.provider)} hitSlop={8}>
                    <Text style={[styles.disconnectText, { color: theme.danger }]}>Salir</Text>
                  </Pressable>
                </View>
              ))}

            {(!msEmail || !gEmail) && (
              <Pressable
                style={[styles.addAccountRow, { borderColor: theme.border }]}
                onPress={!msEmail ? handleConectar : handleConectarGoogle}
              >
                <Ionicons name="add-circle-outline" size={18} color={theme.primary} />
                <Text style={[styles.addAccountText, { color: theme.primary }]}>
                  {!msEmail ? 'Conectar Outlook / Hotmail' : 'Conectar Gmail'}
                </Text>
              </Pressable>
            )}

            <View style={styles.rangoRow}>
              {([
                { key: 'mes', label: 'Este mes' },
                { key: 'tres', label: 'Ultimos 3 meses' },
              ] as const).map((r) => (
                <Pressable
                  key={r.key}
                  onPress={() => cambiarRango(r.key)}
                  style={[
                    styles.rangoChip,
                    {
                      backgroundColor: rango === r.key ? theme.primary : theme.surface,
                      borderColor: rango === r.key ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.rangoChipText,
                      { color: rango === r.key ? '#FFFFFF' : theme.textSecondary },
                    ]}
                  >
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {gastos.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="checkmark-circle" size={48} color={theme.accent} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Todo al dia</Text>
                <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                  No encontramos gastos nuevos del banco en este periodo.
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.resultsTitle, { color: theme.text }]}>
                  {gastos.length} gasto{gastos.length !== 1 ? 's' : ''} encontrado
                  {gastos.length !== 1 ? 's' : ''}
                </Text>
                {fusionados > 0 && (
                  <Text style={[styles.fusionNote, { color: theme.textTertiary }]}>
                    {fusionados} recibo{fusionados !== 1 ? 's' : ''} de servicios se
                    {fusionados !== 1 ? ' unieron' : ' unió'} a su cobro del banco (sin duplicar)
                  </Text>
                )}
                {gastos.map((g) => (
                  <Pressable
                    key={g.messageId}
                    onPress={() => toggleSelect(g.messageId)}
                    style={[
                      styles.emailCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: selected.has(g.messageId) ? theme.primary : theme.border,
                        borderWidth: selected.has(g.messageId) ? 2 : 1,
                      },
                    ]}
                  >
                    <View style={styles.emailCheck}>
                      <Ionicons
                        name={selected.has(g.messageId) ? 'checkbox' : 'square-outline'}
                        size={24}
                        color={selected.has(g.messageId) ? theme.primary : theme.textTertiary}
                      />
                    </View>
                    <View style={styles.emailInfo}>
                      <View style={styles.emailTop}>
                        <Text style={[styles.emailAmount, { color: theme.text }]}>
                          ${g.monto.toFixed(2)}
                        </Text>
                        {g.banco && (
                          <View style={[styles.bankChip, { backgroundColor: theme.primary + '20' }]}>
                            <Text style={[styles.bankChipText, { color: theme.primary }]}>
                              {g.banco}
                            </Text>
                          </View>
                        )}
                        {posiblesDup.has(g.messageId) && (
                          <View style={[styles.bankChip, { backgroundColor: '#B4530920' }]}>
                            <Text style={[styles.bankChipText, { color: '#B45309' }]}>
                              Posible duplicado
                            </Text>
                          </View>
                        )}
                      </View>
                      {(g.comercio || g.subject) && (
                        <Text style={[styles.emailComercio, { color: theme.textSecondary }]} numberOfLines={1}>
                          {g.comercio || g.subject}
                        </Text>
                      )}
                      <Text style={[styles.emailDate, { color: theme.textTertiary }]}>
                        {formatDate(g.fecha)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </>
            )}

            {pendientes.length > 0 && (
              <>
                <Text style={[styles.label, { color: theme.textSecondary }]}>
                  POR PAGAR — NO SE IMPORTAN
                </Text>
                {pendientes.map((g) => (
                  <View
                    key={g.messageId}
                    style={[
                      styles.emailCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        borderWidth: 1,
                        opacity: 0.65,
                      },
                    ]}
                  >
                    <View style={styles.emailInfo}>
                      <View style={styles.emailTop}>
                        <Text style={[styles.emailAmount, { color: theme.textSecondary }]}>
                          ${g.monto.toFixed(2)}
                        </Text>
                        <View style={[styles.bankChip, { backgroundColor: '#B4530920' }]}>
                          <Text style={[styles.bankChipText, { color: '#B45309' }]}>
                            Por pagar
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[styles.emailComercio, { color: theme.textSecondary }]}
                        numberOfLines={1}
                      >
                        {g.comercio || g.subject}
                      </Text>
                      <Text style={[styles.emailDate, { color: theme.textTertiary }]}>
                        {formatDate(g.fecha)} — se importara cuando llegue el cobro
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {step === 'importing' && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Importando gastos...
            </Text>
          </View>
        )}

        {step === 'done' && (
          <View style={styles.doneBox}>
            <Ionicons name="checkmark-circle" size={64} color={theme.accent} />
            <Text style={[styles.doneTitle, { color: theme.text }]}>
              {imported} gasto{imported !== 1 ? 's' : ''} importado{imported !== 1 ? 's' : ''}
            </Text>
            <Text style={[styles.doneSubtitle, { color: theme.textSecondary }]}>
              Los gastos se agregaron a tu registro.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step === 'landing' && (
          <>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: '#0078D4' }]}
              onPress={handleConectar}
            >
              <Ionicons name="logo-microsoft" size={20} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Conectar Outlook / Hotmail</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: '#EA4335' }]}
              onPress={handleConectarGoogle}
            >
              <Ionicons name="logo-google" size={20} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Conectar Gmail</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, { borderColor: theme.border }]}
              onPress={() => router.replace('/gasto/sync')}
            >
              <Ionicons name="options" size={18} color={theme.textSecondary} />
              <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>
                Otras formas de importar
              </Text>
            </Pressable>
          </>
        )}

        {step === 'results' && gastos.length > 0 && (
          <>
            <Pressable
              style={[
                styles.primaryBtn,
                { backgroundColor: theme.primary, opacity: selected.size === 0 ? 0.5 : 1 },
              ]}
              onPress={handleImportar}
            >
              <Ionicons name="download" size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>
                Importar {selected.size} gasto{selected.size !== 1 ? 's' : ''}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, { borderColor: theme.border }]}
              onPress={handleReimportar}
            >
              <Ionicons name="refresh-circle" size={16} color={theme.textSecondary} />
              <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>
                Reimportar todo
              </Text>
            </Pressable>
          </>
        )}

        {step === 'results' && gastos.length === 0 && (
          <>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
              onPress={() => buscar(rango)}
            >
              <Ionicons name="refresh" size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Buscar de nuevo</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, { borderColor: theme.border }]}
              onPress={handleReimportar}
            >
              <Ionicons name="refresh-circle" size={16} color={theme.textSecondary} />
              <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>
                Reimportar todo
              </Text>
            </Pressable>
          </>
        )}

        {step === 'done' && (
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={() => router.replace('/')}
          >
            <Ionicons name="home" size={20} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Volver al inicio</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: { fontSize: 18, fontWeight: '700' },
  content: { paddingBottom: 160 },
  landingBox: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 32 },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  landingTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 32,
  },
  landingSubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  featureList: { marginTop: 28, gap: 14, alignSelf: 'stretch' },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureText: { fontSize: 15, flex: 1 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  errorText: { flex: 1, fontSize: 13 },
  loadingBox: { alignItems: 'center', paddingTop: 80, gap: 16 },
  loadingText: { fontSize: 16, fontWeight: '600' },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  accountText: { fontSize: 13, flex: 1 },
  disconnectText: { fontSize: 13, fontWeight: '600' },
  addAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addAccountText: { fontSize: 13, fontWeight: '600' },
  rangoRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 14,
  },
  rangoChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  rangoChipText: { fontSize: 13, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingTop: 50, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
  resultsTitle: { fontSize: 16, fontWeight: '700', marginHorizontal: 16, marginBottom: 4 },
  fusionNote: { fontSize: 12, marginHorizontal: 16, marginBottom: 10 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 8,
  },
  emailCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    padding: 14,
  },
  emailCheck: { marginRight: 12, justifyContent: 'center' },
  emailInfo: { flex: 1 },
  emailTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  emailAmount: { fontSize: 18, fontWeight: '700' },
  bankChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  bankChipText: { fontSize: 11, fontWeight: '600' },
  emailComercio: { fontSize: 14, marginBottom: 2 },
  emailDate: { fontSize: 12 },
  doneBox: { alignItems: 'center', paddingTop: 60, gap: 8 },
  doneTitle: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  doneSubtitle: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 34,
    gap: 10,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 13.5, fontWeight: '600' },
});
