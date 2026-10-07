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
import {
  isConnected,
  getAccount,
  startLogin,
  handleCallback,
  disconnect,
  getClientId,
  setClientId,
} from '../../services/googleAuth';
import {
  fetchBankEmails,
  markAsImported,
  GmailTransaction,
} from '../../services/gmailSync';
import { Tarjeta, Categoria } from '../../types';

type Step = 'connect' | 'syncing' | 'results' | 'importing';

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
  const [step, setStep] = useState<Step>('connect');
  const [error, setError] = useState('');
  const [emails, setEmails] = useState<GmailTransaction[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [imported, setImported] = useState(0);
  const [processing, setProcessing] = useState(false);

  const account = getAccount();

  const init = useCallback(async () => {
    const [t, c] = await Promise.all([getTarjetas(), getCategorias()]);
    setTarjetas(t);
    setCategorias(c);

    // Check for OAuth callback
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        window.history.replaceState({}, '', window.location.pathname);
        setStep('syncing');
        try {
          await handleCallback(code);
          const results = await fetchBankEmails();
          setEmails(results);
          setSelected(new Set(results.map((e) => e.emailId)));
          setStep('results');
        } catch (err: any) {
          setError(err.message || 'Error al conectar');
          setStep('connect');
        }
        return;
      }
    }

    if (isConnected()) {
      handleSync();
    } else {
      setStep('connect');
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  const handleConnect = async () => {
    setError('');
    try {
      await startLogin();
    } catch (err: any) {
      if (err.message === 'NO_CLIENT_ID') {
        setError('Configura el Client ID de Google primero');
      } else {
        setError(err.message || 'Error al iniciar sesion');
      }
    }
  };

  const handleSync = async () => {
    setStep('syncing');
    setError('');
    try {
      const results = await fetchBankEmails();
      setEmails(results);
      setSelected(new Set(results.map((e) => e.emailId)));
      setStep('results');
    } catch (err: any) {
      if (err.message === 'TOKEN_EXPIRED' || err.message === 'NOT_SIGNED_IN') {
        setStep('connect');
        setError('Sesion expirada. Conecta de nuevo.');
      } else {
        setError(err.message || 'Error al buscar correos');
        setStep('results');
      }
    }
  };

  const toggleSelect = (emailId: string) => {
    const next = new Set(selected);
    if (next.has(emailId)) next.delete(emailId);
    else next.add(emailId);
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
    const selectedEmails = emails.filter((e) => selected.has(e.emailId));

    for (const email of selectedEmails) {
      const matchedTarjeta = email.parsed.ultimos4
        ? tarjetas.find((t) => t.ultimos4 === email.parsed.ultimos4)
        : null;

      const autoCategory = email.parsed.comercio
        ? guessCategory(email.parsed.comercio, categorias)
        : null;

      try {
        await insertGasto({
          monto: email.parsed.monto,
          fecha: email.parsed.fecha || new Date().toISOString().split('T')[0],
          nota: email.subject,
          comercio: email.parsed.comercio || undefined,
          tarjetaId: matchedTarjeta?.id || tarjetas[0]?.id,
          categoriaId: autoCategory || categoriaId || categorias[categorias.length - 1]?.id,
        });
        count++;
      } catch {}
    }

    markAsImported(selectedEmails.map((e) => e.emailId));
    setImported(count);
    setProcessing(false);
    hapticSuccess();
  };

  const handleDisconnect = () => {
    Alert.alert('Desconectar correo', 'Se cerrara la sesion de Gmail.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar',
        style: 'destructive',
        onPress: () => {
          disconnect();
          setStep('connect');
        },
      },
    ]);
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
          {step === 'connect' ? 'Conecta tu correo' : 'Gastos encontrados'}
        </Text>
        {isConnected() ? (
          <Pressable onPress={handleDisconnect} hitSlop={12}>
            <Ionicons name="log-out-outline" size={24} color={theme.danger} />
          </Pressable>
        ) : (
          <View style={{ width: 28 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* CONNECT */}
        {step === 'connect' && (
          <>
            <View style={styles.connectBox}>
              <View style={[styles.iconCircle, { backgroundColor: theme.primary + '20' }]}>
                <Ionicons name="mail" size={48} color={theme.primary} />
              </View>
              <Text style={[styles.connectTitle, { color: theme.text }]}>
                Registra tus gastos{'\n'}automaticamente
              </Text>
              <Text style={[styles.connectSubtitle, { color: theme.textSecondary }]}>
                Conecta tu correo y detectaremos las notificaciones de tu banco sin que tengas que escribir nada.
              </Text>
            </View>

            <View style={styles.featureList}>
              {[
                { icon: 'flash', text: 'Detecta gastos automaticamente' },
                { icon: 'shield-checkmark', text: 'Solo lee emails del banco' },
                { icon: 'time', text: 'Sincroniza en segundos' },
              ].map((f) => (
                <View key={f.icon} style={styles.featureItem}>
                  <Ionicons name={f.icon as any} size={20} color={theme.primary} />
                  <Text style={[styles.featureText, { color: theme.textSecondary }]}>{f.text}</Text>
                </View>
              ))}
            </View>

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: theme.danger + '15' }]}>
                <Ionicons name="alert-circle" size={18} color={theme.danger} />
                <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
              </View>
            ) : null}
          </>
        )}

        {/* SYNCING */}
        {step === 'syncing' && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Buscando notificaciones bancarias...
            </Text>
            <Text style={[styles.loadingSubtext, { color: theme.textTertiary }]}>
              Revisando emails de los ultimos 7 dias
            </Text>
          </View>
        )}

        {/* RESULTS */}
        {step === 'results' && (
          <>
            {account && (
              <View style={[styles.accountBadge, { backgroundColor: theme.surface }]}>
                <Ionicons name="person-circle" size={20} color={theme.primary} />
                <Text style={[styles.accountText, { color: theme.textSecondary }]}>
                  {account.email}
                </Text>
                <Pressable onPress={handleSync} hitSlop={8}>
                  <Ionicons name="refresh" size={18} color={theme.primary} />
                </Pressable>
              </View>
            )}

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: theme.danger + '15' }]}>
                <Ionicons name="alert-circle" size={18} color={theme.danger} />
                <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
              </View>
            ) : null}

            {emails.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="checkmark-circle" size={48} color={theme.accent} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Todo al dia</Text>
                <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                  No hay nuevas notificaciones bancarias por importar.
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.resultsTitle, { color: theme.text }]}>
                  {emails.length} gasto{emails.length !== 1 ? 's' : ''} encontrado{emails.length !== 1 ? 's' : ''}
                </Text>

                {emails.map((email) => (
                  <Pressable
                    key={email.emailId}
                    onPress={() => toggleSelect(email.emailId)}
                    style={[
                      styles.emailCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: selected.has(email.emailId) ? theme.primary : theme.border,
                        borderWidth: selected.has(email.emailId) ? 2 : 1,
                      },
                    ]}
                  >
                    <View style={styles.emailCheck}>
                      <Ionicons
                        name={selected.has(email.emailId) ? 'checkbox' : 'square-outline'}
                        size={24}
                        color={selected.has(email.emailId) ? theme.primary : theme.textTertiary}
                      />
                    </View>
                    <View style={styles.emailInfo}>
                      <View style={styles.emailTop}>
                        <Text style={[styles.emailAmount, { color: theme.text }]}>
                          ${email.parsed.monto.toFixed(2)}
                        </Text>
                        {email.parsed.banco && (
                          <View style={[styles.bankChip, { backgroundColor: theme.primary + '20' }]}>
                            <Text style={[styles.bankChipText, { color: theme.primary }]}>
                              {email.parsed.banco}
                            </Text>
                          </View>
                        )}
                      </View>
                      {email.parsed.comercio && (
                        <Text style={[styles.emailComercio, { color: theme.textSecondary }]}>
                          {email.parsed.comercio}
                        </Text>
                      )}
                      <Text style={[styles.emailDate, { color: theme.textTertiary }]}>
                        {formatDate(email.receivedDate)}
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
        {step === 'connect' && (
          <Pressable
            style={[styles.googleBtn]}
            onPress={handleConnect}
          >
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleBtnText}>Conectar con Google</Text>
          </Pressable>
        )}

        {step === 'connect' && (
          <Pressable
            style={[styles.secondaryBtn, { borderColor: theme.border }]}
            onPress={() => router.replace('/gasto/importar')}
          >
            <Ionicons name="clipboard" size={18} color={theme.textSecondary} />
            <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>
              Pegar texto manualmente
            </Text>
          </Pressable>
        )}

        {step === 'results' && emails.length > 0 && (
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

        {step === 'results' && emails.length === 0 && (
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={handleSync}
          >
            <Ionicons name="refresh" size={20} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Buscar de nuevo</Text>
          </Pressable>
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
  connectBox: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32 },
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
  featureList: {
    marginTop: 32,
    marginHorizontal: 32,
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 15,
  },
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
  loadingSubtext: { fontSize: 13 },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  accountText: { fontSize: 13, flex: 1 },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
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
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
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
});
