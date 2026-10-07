import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticImpact } from '../../hooks/useHaptics';
import { useTheme } from '../../hooks/useColorScheme';
import { GastoItem } from '../../components/GastoItem';
import { getGastosMes, getTotalMes, deleteGasto, getTarjetas } from '../../db/database';
import { GastoConDetalles } from '../../types';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function HomeScreen() {
  const theme = useTheme();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [gastos, setGastos] = useState<GastoConDetalles[]>([]);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [hasTarjetas, setHasTarjetas] = useState(true);

  const loadData = useCallback(async () => {
    const [gastosData, totalData, tarjetas] = await Promise.all([
      getGastosMes(mes, ano),
      getTotalMes(mes, ano),
      getTarjetas(),
    ]);
    setGastos(gastosData);
    setTotal(totalData);
    setHasTarjetas(tarjetas.length > 0);
  }, [mes, ano]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const cambiarMes = (dir: -1 | 1) => {
    let nuevoMes = mes + dir;
    let nuevoAno = ano;
    if (nuevoMes < 1) {
      nuevoMes = 12;
      nuevoAno--;
    } else if (nuevoMes > 12) {
      nuevoMes = 1;
      nuevoAno++;
    }
    setMes(nuevoMes);
    setAno(nuevoAno);
  };

  const handleNuevoGasto = () => {
    if (!hasTarjetas) {
      Alert.alert(
        'Agrega una tarjeta',
        'Primero necesitas agregar al menos una tarjeta para registrar gastos.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Agregar tarjeta', onPress: () => router.push('/tarjeta/nueva') },
        ]
      );
      return;
    }
    hapticImpact('medium');
    router.push('/gasto/nuevo');
  };

  const handleDeleteGasto = (gasto: GastoConDetalles) => {
    hapticImpact('light');
    Alert.alert(
      'Eliminar gasto',
      `Eliminar $${gasto.monto.toFixed(2)} en ${gasto.comercio || gasto.categoriaNombre}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteGasto(gasto.id);
            loadData();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Mis Gastos</Text>
      </View>

      <View style={[styles.monthSelector, { backgroundColor: theme.surface }]}>
        <Pressable onPress={() => cambiarMes(-1)} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.primary} />
        </Pressable>
        <Text style={[styles.monthText, { color: theme.text }]}>
          {MESES[mes - 1]} {ano}
        </Text>
        <Pressable onPress={() => cambiarMes(1)} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={theme.primary} />
        </Pressable>
      </View>

      <View style={[styles.totalCard, { backgroundColor: theme.primary }]}>
        <Text style={styles.totalLabel}>Total del mes</Text>
        <Text style={styles.totalAmount}>${total.toFixed(2)}</Text>
        <Text style={styles.totalCount}>
          {gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'}
        </Text>
      </View>

      <FlatList
        data={gastos}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <GastoItem gasto={item} onLongPress={() => handleDeleteGasto(item)} />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>💸</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No hay gastos este mes
            </Text>
            <Text style={[styles.emptySubtext, { color: theme.textTertiary }]}>
              Toca el boton + para agregar uno
            </Text>
          </View>
        }
      />

      <Pressable
        style={[styles.fabImport, { backgroundColor: theme.surface, borderColor: theme.primary }]}
        onPress={() => {
          if (!hasTarjetas) {
            Alert.alert(
              'Agrega una tarjeta',
              'Primero necesitas agregar al menos una tarjeta.',
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Agregar tarjeta', onPress: () => router.push('/tarjeta/nueva') },
              ]
            );
            return;
          }
          hapticImpact('medium');
          router.push('/gasto/importar');
        }}
      >
        <Ionicons name="mail-open" size={22} color={theme.primary} />
      </Pressable>
      <Pressable
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={handleNuevoGasto}
      >
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  monthText: {
    fontSize: 16,
    fontWeight: '600',
  },
  totalCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
  },
  totalLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  totalAmount: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    marginTop: 4,
  },
  totalCount: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 4,
  },
  list: {
    paddingTop: 12,
    paddingBottom: 100,
  },
  empty: {
    alignItems: 'center',
    marginTop: 60,
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
  fabImport: {
    position: 'absolute',
    bottom: 170,
    right: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
