import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticImpact } from '../../hooks/useHaptics';
import { useTheme } from '../../hooks/useColorScheme';
import { TarjetaCard } from '../../components/TarjetaCard';
import { getTarjetas, deleteTarjeta } from '../../db/database';
import { Tarjeta } from '../../types';

export default function TarjetasScreen() {
  const theme = useTheme();
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);

  const loadTarjetas = useCallback(async () => {
    const data = await getTarjetas();
    setTarjetas(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTarjetas();
    }, [loadTarjetas])
  );

  const handleDelete = (tarjeta: Tarjeta) => {
    hapticImpact('light');
    Alert.alert(
      'Eliminar tarjeta',
      `Eliminar "${tarjeta.nombre}" (***${tarjeta.ultimos4})?\n\nTambien se eliminaran todos los gastos asociados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteTarjeta(tarjeta.id);
            loadTarjetas();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Tarjetas</Text>
        <Pressable
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={() => {
            hapticImpact('light');
            router.push('/tarjeta/nueva');
          }}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Agregar</Text>
        </Pressable>
      </View>

      <FlatList
        data={tarjetas}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TarjetaCard tarjeta={item} onLongPress={() => handleDelete(item)} />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>💳</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No tienes tarjetas
            </Text>
            <Text style={[styles.emptySubtext, { color: theme.textTertiary }]}>
              Agrega tu primera tarjeta para empezar
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    paddingTop: 8,
    paddingBottom: 100,
  },
  empty: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    marginTop: 4,
  },
});
