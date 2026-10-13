import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  RefreshControl,
  Animated,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticImpact } from '../../hooks/useHaptics';
import { useTheme } from '../../hooks/useColorScheme';
import { GastoItem } from '../../components/GastoItem';
import { getGastosMes, getTotalMes, deleteGasto } from '../../db/database';
import { parseNotification } from '../../utils/bankParser';
import { GastoConDetalles } from '../../types';
import { Platform } from 'react-native';

function webAlert(title: string, message: string, buttons?: Array<{text: string; style?: string; onPress?: () => void}>) {
  if (Platform.OS === 'web') {
    const action = buttons?.find(b => b.style !== 'cancel');
    if (action) {
      if (window.confirm(`${title}\n${message}`)) {
        action.onPress?.();
      }
    } else {
      window.alert(`${title}\n${message}`);
    }
  } else {
    Alert.alert(title, message, buttons as any);
  }
}

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
  const [clipboardBanner, setClipboardBanner] = useState<{ text: string; comercio: string; monto: number } | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const lastClipRef = useRef('');

  const loadData = useCallback(async () => {
    const [gastosData, totalData] = await Promise.all([
      getGastosMes(mes, ano),
      getTotalMes(mes, ano),
    ]);
    setGastos(gastosData);
    setTotal(totalData);
  }, [mes, ano]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      // Check clipboard for bank notifications
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        navigator.clipboard.readText().then((clip) => {
          if (!clip || clip.length < 20 || clip === lastClipRef.current) return;
          const result = parseNotification(clip);
          if (result && result.monto > 0) {
            lastClipRef.current = clip;
            setClipboardBanner({
              text: clip,
              comercio: result.comercio || result.banco || 'Gasto',
              monto: result.monto,
            });
            Animated.spring(bannerAnim, {
              toValue: 1,
              useNativeDriver: true,
              tension: 80,
              friction: 10,
            }).start();
          }
        }).catch(() => {});
      }
    }, [loadData, bannerAnim])
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

  const dismissBanner = () => {
    Animated.timing(bannerAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setClipboardBanner(null));
  };

  const handleImportClipboard = () => {
    if (!clipboardBanner) return;
    hapticImpact('medium');
    dismissBanner();
    router.push({ pathname: '/gasto/importar', params: { clipText: clipboardBanner.text } });
  };

  const handleNuevoGasto = () => {
    hapticImpact('medium');
    router.push('/gasto/nuevo');
  };

  const handleDeleteGasto = (gasto: GastoConDetalles) => {
    hapticImpact('light');
    webAlert(
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

      <View style={[styles.totalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.totalLabel, { color: theme.textTertiary }]}>TOTAL DEL MES</Text>
        <Text style={[styles.totalAmount, { color: theme.text }]}>${total.toFixed(2)}</Text>
        <View style={[styles.totalBadge, { backgroundColor: theme.primaryLight }]}>
          <Text style={[styles.totalCount, { color: theme.primary }]}>
            {gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'}
          </Text>
        </View>
      </View>

      {clipboardBanner && (
        <Animated.View
          style={[
            styles.clipBanner,
            {
              backgroundColor: theme.accent + '15',
              borderColor: theme.accent,
              opacity: bannerAnim,
              transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
            },
          ]}
        >
          <Pressable style={styles.clipBannerContent} onPress={handleImportClipboard}>
            <View style={[styles.clipIcon, { backgroundColor: theme.accent }]}>
              <Ionicons name="clipboard" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.clipInfo}>
              <Text style={[styles.clipTitle, { color: theme.text }]}>
                Gasto detectado en portapapeles
              </Text>
              <Text style={[styles.clipDetail, { color: theme.textSecondary }]}>
                ${clipboardBanner.monto.toFixed(2)} - {clipboardBanner.comercio}
              </Text>
            </View>
            <Pressable onPress={dismissBanner} hitSlop={12}>
              <Ionicons name="close" size={20} color={theme.textTertiary} />
            </Pressable>
          </Pressable>
        </Animated.View>
      )}

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
          hapticImpact('medium');
          router.push('/gasto/conectar');
        }}
      >
        <Ionicons name="mail-open" size={18} color={theme.primary} />
      </Pressable>
      <Pressable
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={handleNuevoGasto}
      >
        <Ionicons name="add" size={26} color="#FFFFFF" />
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
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  monthText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  totalCard: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
  },
  totalAmount: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  totalBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 8,
  },
  totalCount: {
    fontSize: 11.5,
    fontWeight: '600',
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
  clipBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  clipBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  clipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipInfo: {
    flex: 1,
  },
  clipTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  clipDetail: {
    fontSize: 13,
    marginTop: 2,
  },
  fabImport: {
    position: 'absolute',
    bottom: 158,
    right: 24,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 6,
  },
});
