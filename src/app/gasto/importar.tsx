import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticSuccess } from '../../hooks/useHaptics';
import { useTheme } from '../../hooks/useColorScheme';
import { CategoriaSelector } from '../../components/CategoriaSelector';
import { getTarjetas, getCategorias, insertGasto } from '../../db/database';
import { parseNotification, ParsedTransaction } from '../../utils/bankParser';
import { Tarjeta, Categoria } from '../../types';

export default function ImportarGastoScreen() {
  const theme = useTheme();
  const [textoNotificacion, setTextoNotificacion] = useState('');
  const [parsed, setParsed] = useState<ParsedTransaction | null>(null);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tarjetaId, setTarjetaId] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [monto, setMonto] = useState('');
  const [comercio, setComercio] = useState('');
  const [fecha, setFecha] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'paste' | 'review'>('paste');

  useEffect(() => {
    (async () => {
      const [t, c] = await Promise.all([getTarjetas(), getCategorias()]);
      setTarjetas(t);
      setCategorias(c);
      if (t.length > 0) setTarjetaId(t[0].id);
    })();
  }, []);

  const handleParse = () => {
    if (!textoNotificacion.trim()) {
      Alert.alert('Pega el texto de la notificacion del banco');
      return;
    }

    const result = parseNotification(textoNotificacion);
    if (!result) {
      Alert.alert(
        'No se pudo leer',
        'No se pudo extraer la informacion. Verifica que pegaste el texto completo de la notificacion.'
      );
      return;
    }

    setParsed(result);
    setMonto(result.monto.toFixed(2));
    setComercio(result.comercio ?? '');
    setFecha(result.fecha ?? new Date().toISOString().split('T')[0]);

    if (result.ultimos4 && tarjetas.length > 0) {
      const match = tarjetas.find((t) => t.ultimos4 === result.ultimos4);
      if (match) setTarjetaId(match.id);
    }

    setStep('review');
  };

  const handleSave = async () => {
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) {
      Alert.alert('Ingresa un monto valido');
      return;
    }
    if (!tarjetaId) {
      Alert.alert('Selecciona una tarjeta');
      return;
    }
    if (!categoriaId) {
      Alert.alert('Selecciona una categoria');
      return;
    }

    setSaving(true);
    try {
      await insertGasto({
        monto: montoNum,
        fecha: fecha || new Date().toISOString().split('T')[0],
        nota: undefined,
        comercio: comercio.trim() || undefined,
        tarjetaId,
        categoriaId,
      });
      hapticSuccess();
      router.back();
    } catch {
      Alert.alert('Error', 'No se pudo guardar el gasto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => step === 'review' ? setStep('paste') : router.back()} hitSlop={12}>
          <Ionicons
            name={step === 'review' ? 'arrow-back' : 'close'}
            size={28}
            color={theme.text}
          />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>
          {step === 'paste' ? 'Importar gasto' : 'Verificar datos'}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {step === 'paste' ? (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            <View style={[styles.infoBox, { backgroundColor: theme.primary + '15' }]}>
              <Ionicons name="information-circle" size={20} color={theme.primary} />
              <Text style={[styles.infoText, { color: theme.text }]}>
                Pega aqui el texto de la notificacion que te envia tu banco por email cuando
                haces una compra o transferencia.
              </Text>
            </View>

            <Text style={[styles.label, { color: theme.textSecondary }]}>
              Texto de la notificacion
            </Text>
            <TextInput
              style={[
                styles.textArea,
                { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border },
              ]}
              placeholder="Pega aqui el texto del email del banco..."
              placeholderTextColor={theme.textTertiary}
              value={textoNotificacion}
              onChangeText={setTextoNotificacion}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
              autoFocus
            />

            <Text style={[styles.supportedBanks, { color: theme.textTertiary }]}>
              Bancos soportados: Pichincha, Guayaquil, Produbanco, Pacifico, Austro,
              Internacional, Diners Club
            </Text>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            {parsed?.banco && (
              <View style={[styles.bankBadge, { backgroundColor: theme.primary + '20' }]}>
                <Ionicons name="business" size={16} color={theme.primary} />
                <Text style={[styles.bankText, { color: theme.primary }]}>
                  {parsed.banco}
                  {parsed.tipo ? ` - ${parsed.tipo}` : ''}
                </Text>
              </View>
            )}

            <Text style={[styles.label, { color: theme.textSecondary }]}>Monto</Text>
            <View style={styles.montoRow}>
              <Text style={[styles.montoPrefix, { color: theme.primary }]}>$</Text>
              <TextInput
                style={[styles.montoInput, { backgroundColor: theme.surface, color: theme.text }]}
                value={monto}
                onChangeText={setMonto}
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={[styles.label, { color: theme.textSecondary }]}>Comercio</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
              value={comercio}
              onChangeText={setComercio}
              placeholder="Nombre del comercio"
              placeholderTextColor={theme.textTertiary}
            />

            <Text style={[styles.label, { color: theme.textSecondary }]}>Fecha</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
              value={fecha}
              onChangeText={setFecha}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textTertiary}
            />

            <Text style={[styles.label, { color: theme.textSecondary }]}>Tarjeta</Text>
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
                      {t.nombre} •{t.ultimos4}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.label, { color: theme.textSecondary }]}>Categoria</Text>
            <CategoriaSelector
              categorias={categorias}
              selectedId={categoriaId}
              onSelect={setCategoriaId}
            />
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <Pressable
          style={[
            styles.saveButton,
            { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 },
          ]}
          onPress={step === 'paste' ? handleParse : handleSave}
          disabled={saving}
        >
          <Ionicons
            name={step === 'paste' ? 'scan' : 'checkmark'}
            size={22}
            color="#FFFFFF"
          />
          <Text style={styles.saveText}>
            {step === 'paste' ? 'Leer notificacion' : 'Guardar gasto'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  form: {
    paddingBottom: 120,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 16,
  },
  textArea: {
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    minHeight: 180,
    borderWidth: 1,
  },
  supportedBanks: {
    fontSize: 12,
    paddingHorizontal: 20,
    marginTop: 12,
    lineHeight: 18,
  },
  bankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 8,
  },
  bankText: {
    fontSize: 14,
    fontWeight: '600',
  },
  montoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    gap: 8,
  },
  montoPrefix: {
    fontSize: 24,
    fontWeight: '700',
  },
  montoInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: '700',
  },
  input: {
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  tarjetaScroll: {
    marginBottom: 10,
  },
  tarjetaRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  tarjetaChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  tarjetaChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 34,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
