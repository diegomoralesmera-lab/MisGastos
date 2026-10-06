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
import { Tarjeta, Categoria } from '../../types';

export default function NuevoGastoScreen() {
  const theme = useTheme();
  const [monto, setMonto] = useState('');
  const [comercio, setComercio] = useState('');
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tarjetaId, setTarjetaId] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [t, c] = await Promise.all([getTarjetas(), getCategorias()]);
      setTarjetas(t);
      setCategorias(c);
      if (t.length > 0) setTarjetaId(t[0].id);
    })();
  }, []);

  const handleSave = async () => {
    if (!monto || parseFloat(monto) <= 0) {
      Alert.alert('Ingresa un monto');
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
      const hoy = new Date().toISOString().split('T')[0];
      await insertGasto({
        monto: parseFloat(monto),
        fecha: hoy,
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
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Nuevo gasto</Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
          {/* Monto */}
          <View style={styles.montoSection}>
            <Text style={[styles.montoPrefix, { color: theme.primary }]}>$</Text>
            <TextInput
              style={[styles.montoInput, { color: theme.text }]}
              placeholder="0.00"
              placeholderTextColor={theme.textTertiary}
              keyboardType="decimal-pad"
              value={monto}
              onChangeText={setMonto}
              autoFocus
            />
          </View>

          {/* Comercio */}
          <TextInput
            style={[styles.comercioInput, { backgroundColor: theme.surface, color: theme.text }]}
            placeholder="Comercio (opcional)"
            placeholderTextColor={theme.textTertiary}
            value={comercio}
            onChangeText={setComercio}
          />

          {/* Tarjeta */}
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            Tarjeta
          </Text>
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

          {/* Categoria */}
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            Categoria
          </Text>
          <CategoriaSelector
            categorias={categorias}
            selectedId={categoriaId}
            onSelect={setCategoriaId}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Boton guardar */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.saveButton, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Ionicons name="checkmark" size={22} color="#FFFFFF" />
          <Text style={styles.saveText}>Guardar gasto</Text>
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
  montoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  montoPrefix: {
    fontSize: 36,
    fontWeight: '700',
  },
  montoInput: {
    fontSize: 48,
    fontWeight: '800',
    minWidth: 120,
    textAlign: 'center',
  },
  comercioInput: {
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 10,
    marginTop: 4,
  },
  tarjetaScroll: {
    marginBottom: 20,
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
