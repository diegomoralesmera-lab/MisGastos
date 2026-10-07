import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticSuccess } from '../../hooks/useHaptics';
import { useTheme } from '../../hooks/useColorScheme';
import { CategoriaSelector } from '../../components/CategoriaSelector';
import { getTarjetas, getCategorias, insertGasto } from '../../db/database';
import { Tarjeta, Categoria } from '../../types';

const EMAIL_FORWARD_ADDRESS = 'import@gastos.saynet.ec';

const API_BASE = typeof window !== 'undefined'
  ? window.location.origin
  : '';

interface ServerGasto {
  id: number;
  monto: number;
  comercio: string | null;
  fecha: string;
  banco: string | null;
  tipo: string | null;
  ultimos4: string | null;
  categoria: string | null;
  created_at: string;
}

type Step = 'setup' | 'syncing' | 'results' | 'importing';

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Comida: ['restaurant', 'comida', 'food', 'pizza', 'burger', 'cafe', 'coffee', 'kfc', 'mcdonald'],
  Transporte: ['uber', 'taxi', 'cabify', 'gasolina', 'riocargo', 'courier', 'envio', 'express'],
  Supermercado: ['supermaxi', 'megamaxi', 'tia', 'coral', 'supermercado', 'market', 'gran aki'],
  Salud: ['farmacia', 'hospital', 'clinica', 'medic', 'dental', 'fybeca', 'sana sana'],
  Educacion: ['school', 'colegio', 'universidad', 'homeschool', 'educacion', 'curso', 'academy'],
  Servicios: ['electrica', 'agua', 'telefon', 'internet', 'cnt', 'claro', 'movistar'],
  Hogar: ['ferreteria', 'mueble', 'hogar', 'casa', 'home'],
  Viajes: ['hotel', 'vuelo', 'flight', 'airbnb', 'booking', 'viaje'],
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

export default function SyncScreen() {
  const theme = useTheme();
  const [step, setStep] = useState<Step>('setup');
  const [error, setError] = useState('');
  const [serverGastos, setServerGastos] = useState<ServerGasto[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [imported, setImported] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  const init = useCallback(async () => {
    const [t, c] = await Promise.all([getTarjetas(), getCategorias()]);
    setTarjetas(t);
    setCategorias(c);
  }, []);

  useEffect(() => { init(); }, [init]);

  const handleCopyEmail = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(EMAIL_FORWARD_ADDRESS);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  };

  const handleSync = async () => {
    setStep('syncing');
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/imports`);
      if (!res.ok) throw new Error('Error al consultar el servidor');
      const data = await res.json();
      const gastos: ServerGasto[] = data.gastos || [];
      setServerGastos(gastos);
      setSelected(new Set(gastos.map((g) => g.id)));
      setStep('results');
    } catch (err: any) {
      setError(err.message || 'Error de conexion');
      setStep('results');
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleImportAll = async () => {
    if (selected.size === 0) {
      Alert.alert('Selecciona al menos un gasto');
      return;
    }

    setProcessing(true);
    setStep('importing');
    let count = 0;
    const selectedGastos = serverGastos.filter((g) => selected.has(g.id));

    for (const gasto of selectedGastos) {
      const matchedTarjeta = gasto.ultimos4
        ? tarjetas.find((t) => t.ultimos4 === gasto.ultimos4)
        : null;

      const autoCategory = gasto.comercio
        ? guessCategory(gasto.comercio, categorias)
        : null;

      const serverCategory = gasto.categoria
        ? categorias.find((c) => c.nombre === gasto.categoria)?.id
        : null;

      try {
        await insertGasto({
          monto: Number(gasto.monto),
          fecha: gasto.fecha || new Date().toISOString().split('T')[0],
          nota: gasto.banco ? `${gasto.banco} - ${gasto.tipo || 'email'}` : undefined,
          comercio: gasto.comercio || undefined,
          tarjetaId: matchedTarjeta?.id || tarjetas[0]?.id,
          categoriaId: serverCategory || autoCategory || categoriaId || categorias[categorias.length - 1]?.id,
        });
        count++;
      } catch {}
    }

    // Mark as imported on server
    try {
      await fetch(`${API_BASE}/api/imports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedGastos.map((g) => g.id) }),
      });
    } catch {}

    setImported(count);
    setProcessing(false);
    hapticSuccess();
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>
          {step === 'setup' ? 'Importar gastos' : step === 'results' ? 'Gastos encontrados' : 'Sincronizando'}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* SETUP */}
        {step === 'setup' && (
          <>
            <View style={styles.connectBox}>
              <View style={[styles.iconCircle, { backgroundColor: theme.primary + '20' }]}>
                <Ionicons name="mail" size={48} color={theme.primary} />
              </View>
              <Text style={[styles.connectTitle, { color: theme.text }]}>
                Registra tus gastos{'\n'}automaticamente
              </Text>
              <Text style={[styles.connectSubtitle, { color: theme.textSecondary }]}>
                Reenvia los emails de tu banco y detectaremos tus gastos sin que escribas nada.
              </Text>
            </View>

            <View style={[styles.setupCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.setupStep, { color: theme.primary }]}>PASO 1</Text>
              <Text style={[styles.setupTitle, { color: theme.text }]}>
                Copia esta direccion de email
              </Text>
              <Pressable
                onPress={handleCopyEmail}
                style={[styles.emailBox, { backgroundColor: theme.background, borderColor: theme.primary }]}
              >
                <Text style={[styles.emailText, { color: theme.primary }]}>
                  {EMAIL_FORWARD_ADDRESS}
                </Text>
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy'}
                  size={20}
                  color={theme.primary}
                />
              </Pressable>
              {copied && (
                <Text style={[styles.copiedText, { color: theme.accent }]}>Copiado!</Text>
              )}
            </View>

            <View style={[styles.setupCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.setupStep, { color: theme.primary }]}>PASO 2</Text>
              <Text style={[styles.setupTitle, { color: theme.text }]}>
                Crea una regla de reenvio
              </Text>
              <Text style={[styles.setupDesc, { color: theme.textSecondary }]}>
                En tu correo (Gmail, Hotmail, Yahoo, etc.), crea una regla que reenvie automaticamente
                los emails de tu banco a la direccion de arriba.
              </Text>
              <View style={styles.bankList}>
                {['alertas@pichincha.com', 'notificaciones@pichincha.com', 'alertas@bancoguayaquil.com'].map((email) => (
                  <View key={email} style={[styles.bankItem, { backgroundColor: theme.background }]}>
                    <Ionicons name="mail-outline" size={14} color={theme.textTertiary} />
                    <Text style={[styles.bankEmail, { color: theme.textSecondary }]}>{email}</Text>
                  </View>
                ))}
                <Text style={[styles.bankMore, { color: theme.textTertiary }]}>
                  + otros bancos de Ecuador
                </Text>
              </View>
            </View>

            <View style={[styles.setupCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.setupStep, { color: theme.primary }]}>PASO 3</Text>
              <Text style={[styles.setupTitle, { color: theme.text }]}>
                Sincroniza desde aqui
              </Text>
              <Text style={[styles.setupDesc, { color: theme.textSecondary }]}>
                Toca "Buscar gastos" para ver los gastos detectados de tus emails reenviados.
                Aparecen en segundos.
              </Text>
            </View>

            <View style={styles.featureList}>
              {[
                { icon: 'flash', text: 'Detecta gastos automaticamente' },
                { icon: 'shield-checkmark', text: 'Solo lee emails del banco' },
                { icon: 'globe', text: 'Funciona con cualquier correo' },
                { icon: 'lock-closed', text: 'No necesita contrasenas' },
              ].map((f) => (
                <View key={f.icon} style={styles.featureItem}>
                  <Ionicons name={f.icon as any} size={20} color={theme.primary} />
                  <Text style={[styles.featureText, { color: theme.textSecondary }]}>{f.text}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* SYNCING */}
        {step === 'syncing' && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Buscando gastos nuevos...
            </Text>
          </View>
        )}

        {/* RESULTS */}
        {step === 'results' && (
          <>
            {error ? (
              <View style={[styles.errorBox, { backgroundColor: theme.danger + '15' }]}>
                <Ionicons name="alert-circle" size={18} color={theme.danger} />
                <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
              </View>
            ) : null}

            {serverGastos.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="checkmark-circle" size={48} color={theme.accent} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Todo al dia</Text>
                <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                  No hay nuevos gastos por importar.{'\n'}Reenvia un email de tu banco para probar.
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.resultsTitle, { color: theme.text }]}>
                  {serverGastos.length} gasto{serverGastos.length !== 1 ? 's' : ''} encontrado{serverGastos.length !== 1 ? 's' : ''}
                </Text>

                {serverGastos.map((gasto) => (
                  <Pressable
                    key={gasto.id}
                    onPress={() => toggleSelect(gasto.id)}
                    style={[
                      styles.emailCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: selected.has(gasto.id) ? theme.primary : theme.border,
                        borderWidth: selected.has(gasto.id) ? 2 : 1,
                      },
                    ]}
                  >
                    <View style={styles.emailCheck}>
                      <Ionicons
                        name={selected.has(gasto.id) ? 'checkbox' : 'square-outline'}
                        size={24}
                        color={selected.has(gasto.id) ? theme.primary : theme.textTertiary}
                      />
                    </View>
                    <View style={styles.emailInfo}>
                      <View style={styles.emailTop}>
                        <Text style={[styles.emailAmount, { color: theme.text }]}>
                          ${Number(gasto.monto).toFixed(2)}
                        </Text>
                        {gasto.banco && (
                          <View style={[styles.bankChip, { backgroundColor: theme.primary + '20' }]}>
                            <Text style={[styles.bankChipText, { color: theme.primary }]}>
                              {gasto.banco}
                            </Text>
                          </View>
                        )}
                      </View>
                      {gasto.comercio && (
                        <Text style={[styles.emailComercio, { color: theme.textSecondary }]}>
                          {gasto.comercio}
                        </Text>
                      )}
                      <Text style={[styles.emailDate, { color: theme.textTertiary }]}>
                        {formatDate(gasto.fecha || gasto.created_at)}
                      </Text>
                    </View>
                  </Pressable>
                ))}

                <Text style={[styles.label, { color: theme.textSecondary }]}>
                  CATEGORIA POR DEFECTO
                </Text>
                <CategoriaSelector
                  categorias={categorias}
                  selectedId={categoriaId}
                  onSelect={setCategoriaId}
                />
              </>
            )}
          </>
        )}

        {/* IMPORTING */}
        {step === 'importing' && !processing && (
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

        {step === 'importing' && processing && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Importando gastos...
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {step === 'setup' && (
          <>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
              onPress={handleSync}
            >
              <Ionicons name="sync" size={20} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Buscar gastos</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, { borderColor: theme.border }]}
              onPress={() => router.replace('/gasto/importar')}
            >
              <Ionicons name="clipboard" size={18} color={theme.textSecondary} />
              <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>
                Pegar texto manualmente
              </Text>
            </Pressable>
          </>
        )}

        {step === 'results' && serverGastos.length > 0 && (
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: theme.primary, opacity: selected.size === 0 ? 0.5 : 1 }]}
            onPress={handleImportAll}
          >
            <Ionicons name="download" size={20} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>
              Importar {selected.size} gasto{selected.size !== 1 ? 's' : ''}
            </Text>
          </Pressable>
        )}

        {step === 'results' && serverGastos.length === 0 && (
          <>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
              onPress={handleSync}
            >
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Buscar de nuevo</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, { borderColor: theme.border }]}
              onPress={() => setStep('setup')}
            >
              <Ionicons name="arrow-back" size={18} color={theme.textSecondary} />
              <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>
                Ver instrucciones
              </Text>
            </Pressable>
          </>
        )}

        {step === 'importing' && !processing && (
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={() => router.back()}
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
  connectBox: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 32 },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  connectTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 30,
  },
  connectSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  setupCard: {
    marginHorizontal: 16,
    marginTop: 20,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  setupStep: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  setupTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  setupDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  emailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    marginTop: 8,
  },
  emailText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  copiedText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  bankList: {
    marginTop: 12,
    gap: 6,
  },
  bankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  bankEmail: { fontSize: 12 },
  bankMore: { fontSize: 12, marginLeft: 10, marginTop: 2 },
  featureList: {
    marginTop: 24,
    marginHorizontal: 32,
    gap: 14,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: { fontSize: 15 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  errorText: { flex: 1, fontSize: 13 },
  loadingBox: { alignItems: 'center', paddingTop: 80, gap: 16 },
  loadingText: { fontSize: 16, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
  resultsTitle: { fontSize: 16, fontWeight: '700', marginHorizontal: 16, marginBottom: 12 },
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
  label: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 16,
  },
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
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
});
