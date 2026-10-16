import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticSuccess, hapticImpact } from '../../hooks/useHaptics';
import { useTheme } from '../../hooks/useColorScheme';
import { CategoriaSelector } from '../../components/CategoriaSelector';
import {
  getGasto,
  getTarjetas,
  getCategorias,
  updateGasto,
  deleteGasto,
} from '../../db/database';
import { Tarjeta, Categoria, GastoConDetalles } from '../../types';

// Enlace al correo original: guardado al importar, o reconstruido
// a partir del id para gastos antiguos
function enlaceCorreo(g: { emailLink?: string; emailId?: string }): string | null {
  if (g.emailLink) return g.emailLink;
  if (!g.emailId) return null;
  if (/^[0-9a-f]{8,20}$/i.test(g.emailId)) {
    return `https://mail.google.com/mail/u/0/#all/${g.emailId}`;
  }
  return `https://outlook.live.com/mail/0/deeplink/read/${encodeURIComponent(g.emailId)}`;
}

function webAlert(
  title: string,
  message?: string,
  buttons?: Array<{ text: string; style?: string; onPress?: () => void }>
) {
  if (Platform.OS === 'web') {
    const action = buttons?.find((b) => b.style !== 'cancel');
    if (action) {
      if (window.confirm(`${title}\n${message || ''}`)) action.onPress?.();
    } else {
      window.alert(message ? `${title}\n${message}` : title);
    }
  } else {
    Alert.alert(title, message, buttons as any);
  }
}

export default function DetalleGastoScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gastoId = Number(id);

  const [gasto, setGasto] = useState<GastoConDetalles | null>(null);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [monto, setMonto] = useState('');
  const [comercio, setComercio] = useState('');
  const [fecha, setFecha] = useState('');
  const [nota, setNota] = useState('');
  const [tarjetaId, setTarjetaId] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [g, t, c] = await Promise.all([getGasto(gastoId), getTarjetas(), getCategorias()]);
      if (!g) {
        router.replace('/');
        return;
      }
      setGasto(g);
      setTarjetas(t);
      setCategorias(c);
      setMonto(String(g.monto));
      setComercio(g.comercio || '');
      setFecha((g.fecha || '').split('T')[0]);
      setNota(g.nota || '');
      setTarjetaId(g.tarjetaId);
      setCategoriaId(g.categoriaId);
    })();
  }, [gastoId]);

  const volver = () => {
    if (router.canGoBack?.()) router.back();
    else router.replace('/');
  };

  const handleGuardar = async () => {
    const m = parseFloat(monto.replace(',', '.'));
    if (!m || m <= 0) {
      webAlert('Monto invalido', 'Ingresa un monto mayor a cero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      webAlert('Fecha invalida', 'Usa el formato AAAA-MM-DD, por ejemplo 2026-10-05.');
      return;
    }
    setSaving(true);
    try {
      await updateGasto(gastoId, {
        monto: m,
        comercio: comercio.trim() || undefined,
        fecha,
        nota: nota.trim() || undefined,
        tarjetaId: tarjetaId ?? gasto?.tarjetaId,
        categoriaId: categoriaId ?? gasto?.categoriaId,
      });
      hapticSuccess();
      volver();
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = () => {
    hapticImpact('light');
    webAlert('Eliminar gasto', `Se eliminara $${gasto?.monto.toFixed(2)} de forma permanente.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteGasto(gastoId);
          volver();
        },
      },
    ]);
  };

  if (!gasto) return <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={volver} hitSlop={12}>
          <Ionicons name="close" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Detalle del gasto</Text>
        <Pressable onPress={handleEliminar} hitSlop={12}>
          <Ionicons name="trash-outline" size={21} color={theme.danger} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Monto */}
        <View style={styles.montoSection}>
          <Text style={[styles.montoPrefix, { color: theme.danger }]}>-$</Text>
          <TextInput
            style={[styles.montoInput, { color: theme.text }]}
            keyboardType="decimal-pad"
            value={monto}
            onChangeText={setMonto}
          />
        </View>

        {/* Datos del correo (solo lectura) */}
        {(gasto.referencia || gasto.emailId) && (
          <View style={[styles.origenCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="mail-outline" size={15} color={theme.textTertiary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.origenText, { color: theme.textSecondary }]}>
                Importado automaticamente del correo
              </Text>
              {gasto.referencia && (
                <Text style={[styles.origenRef, { color: theme.textTertiary }]}>
                  Referencia del banco: {gasto.referencia}
                </Text>
              )}
            </View>
            {enlaceCorreo(gasto) && (
              <Pressable
                onPress={() => {
                  const url = enlaceCorreo(gasto)!;
                  if (Platform.OS === 'web') window.open(url, '_blank');
                }}
                style={[styles.verCorreoBtn, { backgroundColor: theme.primaryLight }]}
                hitSlop={8}
              >
                <Ionicons name="open-outline" size={13} color={theme.primary} />
                <Text style={[styles.verCorreoText, { color: theme.primary }]}>Ver correo</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text style={[styles.label, { color: theme.textSecondary }]}>COMERCIO</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
          placeholder="Nombre del comercio"
          placeholderTextColor={theme.textTertiary}
          value={comercio}
          onChangeText={setComercio}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>FECHA (AAAA-MM-DD)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
          placeholder="2026-10-05"
          placeholderTextColor={theme.textTertiary}
          value={fecha}
          onChangeText={setFecha}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>NOTA</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
          placeholder="Descripcion o nota"
          placeholderTextColor={theme.textTertiary}
          value={nota}
          onChangeText={setNota}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>TARJETA</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tarjetaScroll}>
          <View style={styles.tarjetaRow}>
            {tarjetas.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => setTarjetaId(t.id)}
                style={[
                  styles.tarjetaChip,
                  {
                    backgroundColor: t.id === tarjetaId ? t.color : theme.surface,
                    borderColor: t.id === tarjetaId ? t.color : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tarjetaChipText,
                    { color: t.id === tarjetaId ? '#FFFFFF' : theme.text },
                  ]}
                >
                  {t.nombre}
                  {t.ultimos4 !== '0000' ? ` ••${t.ultimos4}` : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <Text style={[styles.label, { color: theme.textSecondary }]}>CATEGORIA</Text>
        <CategoriaSelector
          categorias={categorias}
          selectedId={categoriaId}
          onSelect={setCategoriaId}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.saveButton, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={handleGuardar}
          disabled={saving}
        >
          <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          <Text style={styles.saveText}>Guardar cambios</Text>
        </Pressable>
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
  title: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  content: { paddingBottom: 120 },
  montoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  montoPrefix: { fontSize: 30, fontWeight: '700' },
  montoInput: {
    fontSize: 40,
    fontWeight: '700',
    minWidth: 110,
    textAlign: 'center',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  origenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  origenText: { fontSize: 12.5, fontWeight: '600' },
  verCorreoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  verCorreoText: { fontSize: 12, fontWeight: '600' },
  origenRef: { fontSize: 11.5, marginTop: 1, fontVariant: ['tabular-nums'] },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tarjetaScroll: { marginBottom: 4 },
  tarjetaRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  tarjetaChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  tarjetaChipText: { fontSize: 13.5, fontWeight: '600' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 30,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 999,
    gap: 8,
  },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
