import { useState } from 'react';
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
import { insertTarjeta } from '../../db/database';
import { CardColors } from '../../constants/colors';

export default function NuevaTarjetaScreen() {
  const theme = useTheme();
  const [nombre, setNombre] = useState('');
  const [ultimos4, setUltimos4] = useState('');
  const [tipo, setTipo] = useState<'credito' | 'debito'>('credito');
  const [color, setColor] = useState(CardColors[0]);
  const [fechaCorte, setFechaCorte] = useState('');
  const [limiteCredito, setLimiteCredito] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nombre.trim()) {
      Alert.alert('Ingresa un nombre para la tarjeta');
      return;
    }
    if (ultimos4.length !== 4) {
      Alert.alert('Ingresa los ultimos 4 digitos');
      return;
    }

    setSaving(true);
    try {
      await insertTarjeta({
        nombre: nombre.trim(),
        ultimos4,
        color,
        tipo,
        fechaCorte: fechaCorte ? parseInt(fechaCorte) : undefined,
        limiteCredito: limiteCredito ? parseFloat(limiteCredito) : undefined,
      });
      hapticSuccess();
      router.back();
    } catch {
      Alert.alert('Error', 'No se pudo guardar la tarjeta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Nueva tarjeta</Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
          {/* Preview */}
          <View style={[styles.preview, { backgroundColor: color }]}>
            <Text style={styles.previewTipo}>
              {tipo === 'credito' ? 'CREDITO' : 'DEBITO'}
            </Text>
            <Text style={styles.previewNombre}>{nombre || 'Mi tarjeta'}</Text>
            <Text style={styles.previewNumero}>
              •••• •••• •••• {ultimos4 || '0000'}
            </Text>
          </View>

          {/* Nombre */}
          <Text style={[styles.label, { color: theme.textSecondary }]}>Nombre</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
            placeholder="Ej: Pichincha Visa"
            placeholderTextColor={theme.textTertiary}
            value={nombre}
            onChangeText={setNombre}
          />

          {/* Ultimos 4 */}
          <Text style={[styles.label, { color: theme.textSecondary }]}>Ultimos 4 digitos</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
            placeholder="1234"
            placeholderTextColor={theme.textTertiary}
            keyboardType="number-pad"
            maxLength={4}
            value={ultimos4}
            onChangeText={setUltimos4}
          />

          {/* Tipo */}
          <Text style={[styles.label, { color: theme.textSecondary }]}>Tipo</Text>
          <View style={styles.tipoRow}>
            {(['credito', 'debito'] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTipo(t)}
                style={[
                  styles.tipoChip,
                  {
                    backgroundColor: tipo === t ? theme.primary : theme.surface,
                    borderColor: tipo === t ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tipoText,
                    { color: tipo === t ? '#FFFFFF' : theme.text },
                  ]}
                >
                  {t === 'credito' ? 'Credito' : 'Debito'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Color */}
          <Text style={[styles.label, { color: theme.textSecondary }]}>Color</Text>
          <View style={styles.colorRow}>
            {CardColors.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[
                  styles.colorCircle,
                  {
                    backgroundColor: c,
                    borderWidth: color === c ? 3 : 0,
                    borderColor: '#FFFFFF',
                  },
                ]}
              />
            ))}
          </View>

          {/* Fecha corte (solo credito) */}
          {tipo === 'credito' && (
            <>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                Dia de corte (opcional)
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
                placeholder="Ej: 15"
                placeholderTextColor={theme.textTertiary}
                keyboardType="number-pad"
                maxLength={2}
                value={fechaCorte}
                onChangeText={setFechaCorte}
              />

              <Text style={[styles.label, { color: theme.textSecondary }]}>
                Limite de credito (opcional)
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
                placeholder="Ej: 5000"
                placeholderTextColor={theme.textTertiary}
                keyboardType="decimal-pad"
                value={limiteCredito}
                onChangeText={setLimiteCredito}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.saveButton, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Ionicons name="checkmark" size={22} color="#FFFFFF" />
          <Text style={styles.saveText}>Guardar tarjeta</Text>
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
  preview: {
    marginHorizontal: 16,
    borderRadius: 18,
    padding: 22,
    minHeight: 130,
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  previewTipo: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  previewNombre: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  previewNumero: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 18,
    letterSpacing: 2,
    marginTop: 16,
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
  input: {
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  tipoRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  tipoChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  tipoText: {
    fontSize: 15,
    fontWeight: '600',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    flexWrap: 'wrap',
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
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
