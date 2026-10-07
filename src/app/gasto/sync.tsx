import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
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
  getClientId,
  setClientId,
  isConnected,
  getAccount,
  startLogin,
  handleCallback,
  disconnect,
} from '../../services/microsoftAuth';
import {
  fetchBankEmails,
  markAsImported,
  EmailTransaction,
} from '../../services/emailSync';
import { Tarjeta, Categoria } from '../../types';

type Step = 'setup' | 'connect' | 'syncing' | 'results' | 'importing';

export default function SyncScreen() {
  const theme = useTheme();
  const [step, setStep] = useState<Step>('setup');
  const [clientId, setClientIdState] = useState('');
  const [error, setError] = useState('');
  const [emails, setEmails] = useState<EmailTransaction[]>([]);
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

    const cid = getClientId();
    setClientIdState(cid);

    if (!cid) {
      setStep('setup');
    } else if (isConnected()) {
      setStep('results');
      handleSync();
    } else {
      setStep('connect');
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  const handleSaveClientId = () => {
    if (!clientId.trim() || clientId.trim().length < 10) {
      Alert.alert('Ingresa un Client ID valido');
      return;
    }
    setClientId(clientId.trim());
    setStep('connect');
  };

  const handleConnect = async () => {
    setError('');
    try {
      await startLogin();
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesion');
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
      if (err.message === 'NOT_SIGNED_IN' || err.message === 'TOKEN_REFRESH_FAILED') {
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
    if (next.has(emailId)) {
      next.delete(emailId);
    } else {
      next.add(emailId);
    }
    setSelected(next);
  };

  const handleImportAll = async () => {
    if (selected.size === 0) {
      Alert.alert('Selecciona al menos un gasto');
      return;
    }
    if (!categoriaId) {
      Alert.alert('Selecciona una categoria por defecto');
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

      try {
        await insertGasto({
          monto: email.parsed.monto,
          fecha: email.parsed.fecha || new Date().toISOString().split('T')[0],
          nota: email.subject,
          comercio: email.parsed.comercio || undefined,
          tarjetaId: matchedTarjeta?.id || tarjetas[0]?.id,
          categoriaId,
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
    Alert.alert('Desconectar correo', 'Se cerrara la sesion de Hotmail.', [
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
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>
          Sincronizar correo
        </Text>
        {isConnected() ? (
          <Pressable onPress={handleDisconnect} hitSlop={12}>
            <Ionicons name="log-out-outline" size={24} color={theme.danger} />
          </Pressable>
        ) : (
          <View style={{ width: 28 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* STEP: SETUP - Enter Client ID */}
        {step === 'setup' && (
          <>
            <View
              style={[styles.infoBox, { backgroundColor: theme.primary + '15' }]}
            >
              <Ionicons
                name="information-circle"
                size={20}
                color={theme.primary}
              />
              <Text style={[styles.infoText, { color: theme.text }]}>
                Para leer tus correos automaticamente, necesitas registrar una
                app en Microsoft Azure (gratis, solo una vez).
              </Text>
            </View>

            <View style={styles.setupSteps}>
              <Text style={[styles.stepTitle, { color: theme.text }]}>
                Pasos para configurar:
              </Text>

              <View style={styles.stepItem}>
                <View
                  style={[styles.stepNum, { backgroundColor: theme.primary }]}
                >
                  <Text style={styles.stepNumText}>1</Text>
                </View>
                <Text style={[styles.stepText, { color: theme.textSecondary }]}>
                  Ve a{' '}
                  <Text style={{ fontWeight: '700', color: theme.primary }}>
                    portal.azure.com
                  </Text>{' '}
                  e inicia sesion con tu cuenta de Hotmail
                </Text>
              </View>

              <View style={styles.stepItem}>
                <View
                  style={[styles.stepNum, { backgroundColor: theme.primary }]}
                >
                  <Text style={styles.stepNumText}>2</Text>
                </View>
                <Text style={[styles.stepText, { color: theme.textSecondary }]}>
                  Busca "App registrations" y haz clic en "New registration"
                </Text>
              </View>

              <View style={styles.stepItem}>
                <View
                  style={[styles.stepNum, { backgroundColor: theme.primary }]}
                >
                  <Text style={styles.stepNumText}>3</Text>
                </View>
                <Text style={[styles.stepText, { color: theme.textSecondary }]}>
                  Nombre: "MisGastos". Tipo de cuenta: "Personal Microsoft
                  accounts only". Redirect URI tipo "SPA":{' '}
                  <Text style={{ fontWeight: '700' }}>
                    {typeof window !== 'undefined'
                      ? window.location.origin + '/gasto/sync'
                      : 'https://misgastos-seven.vercel.app/gasto/sync'}
                  </Text>
                </Text>
              </View>

              <View style={styles.stepItem}>
                <View
                  style={[styles.stepNum, { backgroundColor: theme.primary }]}
                >
                  <Text style={styles.stepNumText}>4</Text>
                </View>
                <Text style={[styles.stepText, { color: theme.textSecondary }]}>
                  Ve a "API permissions", agrega "Microsoft Graph" {'>'}{' '}
                  "Mail.Read" (delegated)
                </Text>
              </View>

              <View style={styles.stepItem}>
                <View
                  style={[styles.stepNum, { backgroundColor: theme.primary }]}
                >
                  <Text style={styles.stepNumText}>5</Text>
                </View>
                <Text style={[styles.stepText, { color: theme.textSecondary }]}>
                  Copia el "Application (client) ID" y pegalo aqui abajo
                </Text>
              </View>
            </View>

            <Text style={[styles.label, { color: theme.textSecondary }]}>
              CLIENT ID
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.surface,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              placeholderTextColor={theme.textTertiary}
              value={clientId}
              onChangeText={setClientIdState}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        )}

        {/* STEP: CONNECT - Sign in with Microsoft */}
        {step === 'connect' && (
          <>
            <View style={styles.connectBox}>
              <Ionicons
                name="mail-outline"
                size={64}
                color={theme.primary}
                style={{ marginBottom: 16 }}
              />
              <Text style={[styles.connectTitle, { color: theme.text }]}>
                Conecta tu correo de Hotmail
              </Text>
              <Text
                style={[
                  styles.connectSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                Inicia sesion con tu cuenta de Microsoft para que podamos leer
                las notificaciones de tu banco automaticamente.
              </Text>
            </View>

            {error ? (
              <View
                style={[
                  styles.errorBox,
                  { backgroundColor: (theme.danger || '#EF4444') + '15' },
                ]}
              >
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color={theme.danger || '#EF4444'}
                />
                <Text
                  style={[
                    styles.errorText,
                    { color: theme.danger || '#EF4444' },
                  ]}
                >
                  {error}
                </Text>
              </View>
            ) : null}
          </>
        )}

        {/* STEP: SYNCING - Loading */}
        {step === 'syncing' && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text
              style={[styles.loadingText, { color: theme.textSecondary }]}
            >
              Buscando notificaciones bancarias...
            </Text>
          </View>
        )}

        {/* STEP: RESULTS - Show found transactions */}
        {step === 'results' && (
          <>
            {account && (
              <View
                style={[
                  styles.accountBadge,
                  { backgroundColor: theme.surface },
                ]}
              >
                <Ionicons
                  name="person-circle"
                  size={20}
                  color={theme.primary}
                />
                <Text
                  style={[styles.accountText, { color: theme.textSecondary }]}
                >
                  {account.email || account.name}
                </Text>
              </View>
            )}

            {error ? (
              <View
                style={[
                  styles.errorBox,
                  { backgroundColor: (theme.danger || '#EF4444') + '15' },
                ]}
              >
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color={theme.danger || '#EF4444'}
                />
                <Text
                  style={[
                    styles.errorText,
                    { color: theme.danger || '#EF4444' },
                  ]}
                >
                  {error}
                </Text>
              </View>
            ) : null}

            {emails.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons
                  name="checkmark-circle"
                  size={48}
                  color={theme.primary}
                />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  Todo al dia
                </Text>
                <Text
                  style={[
                    styles.emptySubtitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  No hay nuevas notificaciones bancarias por importar.
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.resultsTitle, { color: theme.text }]}>
                  {emails.length} gasto{emails.length !== 1 ? 's' : ''}{' '}
                  encontrado{emails.length !== 1 ? 's' : ''}
                </Text>

                {emails.map((email) => (
                  <Pressable
                    key={email.emailId}
                    onPress={() => toggleSelect(email.emailId)}
                    style={[
                      styles.emailCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: selected.has(email.emailId)
                          ? theme.primary
                          : theme.border,
                        borderWidth: selected.has(email.emailId) ? 2 : 1,
                      },
                    ]}
                  >
                    <View style={styles.emailCheck}>
                      <Ionicons
                        name={
                          selected.has(email.emailId)
                            ? 'checkbox'
                            : 'square-outline'
                        }
                        size={24}
                        color={
                          selected.has(email.emailId)
                            ? theme.primary
                            : theme.textTertiary
                        }
                      />
                    </View>
                    <View style={styles.emailInfo}>
                      <View style={styles.emailTop}>
                        <Text
                          style={[styles.emailAmount, { color: theme.text }]}
                        >
                          ${email.parsed.monto.toFixed(2)}
                        </Text>
                        {email.parsed.banco && (
                          <View
                            style={[
                              styles.bankChip,
                              { backgroundColor: theme.primary + '20' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.bankChipText,
                                { color: theme.primary },
                              ]}
                            >
                              {email.parsed.banco}
                            </Text>
                          </View>
                        )}
                      </View>
                      {email.parsed.comercio && (
                        <Text
                          style={[
                            styles.emailComercio,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {email.parsed.comercio}
                        </Text>
                      )}
                      <Text
                        style={[
                          styles.emailDate,
                          { color: theme.textTertiary },
                        ]}
                      >
                        {formatDate(email.receivedDate)} - {email.from}
                      </Text>
                    </View>
                  </Pressable>
                ))}

                <Text
                  style={[styles.label, { color: theme.textSecondary }]}
                >
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

        {/* STEP: IMPORTING - Done */}
        {step === 'importing' && !processing && (
          <View style={styles.doneBox}>
            <Ionicons
              name="checkmark-circle"
              size={64}
              color={theme.primary}
            />
            <Text style={[styles.doneTitle, { color: theme.text }]}>
              {imported} gasto{imported !== 1 ? 's' : ''} importado
              {imported !== 1 ? 's' : ''}
            </Text>
            <Text
              style={[styles.doneSubtitle, { color: theme.textSecondary }]}
            >
              Los gastos se agregaron a tu registro.
            </Text>
          </View>
        )}

        {step === 'importing' && processing && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text
              style={[styles.loadingText, { color: theme.textSecondary }]}
            >
              Importando gastos...
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Footer buttons */}
      <View style={styles.footer}>
        {step === 'setup' && (
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={handleSaveClientId}
          >
            <Ionicons name="key" size={20} color="#FFFFFF" />
            <Text style={styles.btnText}>Guardar configuracion</Text>
          </Pressable>
        )}

        {step === 'connect' && (
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: '#0078d4' }]}
            onPress={handleConnect}
          >
            <Ionicons name="logo-microsoft" size={20} color="#FFFFFF" />
            <Text style={styles.btnText}>Iniciar sesion con Microsoft</Text>
          </Pressable>
        )}

        {step === 'results' && emails.length > 0 && (
          <Pressable
            style={[
              styles.primaryBtn,
              {
                backgroundColor: theme.primary,
                opacity: selected.size === 0 ? 0.5 : 1,
              },
            ]}
            onPress={handleImportAll}
          >
            <Ionicons name="download" size={20} color="#FFFFFF" />
            <Text style={styles.btnText}>
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
            <Text style={styles.btnText}>Buscar de nuevo</Text>
          </Pressable>
        )}

        {step === 'importing' && !processing && (
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={() => router.back()}
          >
            <Ionicons name="home" size={20} color="#FFFFFF" />
            <Text style={styles.btnText}>Volver al inicio</Text>
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
  content: { paddingBottom: 120 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  setupSteps: { marginHorizontal: 16, marginBottom: 24 },
  stepTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  stepItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    borderWidth: 1,
    fontFamily: 'monospace',
  },
  connectBox: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  connectTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  connectSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
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
  loadingText: { fontSize: 15 },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  accountText: { fontSize: 13 },
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
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
