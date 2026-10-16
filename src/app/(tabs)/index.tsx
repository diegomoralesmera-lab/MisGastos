import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  TextInput,
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
import {
  getGastosMes,
  getTotalMes,
  getResumenMes,
  deleteGasto,
  deleteGastos,
  getPresupuestoMensual,
  setPresupuestoMensual,
} from '../../db/database';
import { ResumenCategoria } from '../../types';
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
  const [totalAnterior, setTotalAnterior] = useState(0);
  const [resumen, setResumen] = useState<ResumenCategoria[]>([]);
  const [presupuesto, setPresupuesto] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [clipboardBanner, setClipboardBanner] = useState<{ text: string; comercio: string; monto: number } | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const lastClipRef = useRef('');

  const loadData = useCallback(async () => {
    const mesPrev = mes === 1 ? 12 : mes - 1;
    const anoPrev = mes === 1 ? ano - 1 : ano;
    const [gastosData, totalData, prevData, resumenData, presupuestoData] = await Promise.all([
      getGastosMes(mes, ano),
      getTotalMes(mes, ano),
      getTotalMes(mesPrev, anoPrev),
      getResumenMes(mes, ano),
      getPresupuestoMensual(),
    ]);
    setGastos(gastosData);
    setTotal(totalData);
    setTotalAnterior(prevData);
    setResumen(resumenData);
    setPresupuesto(presupuestoData);
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

  const toggleSelectMode = () => {
    hapticImpact('light');
    setSelectedIds(new Set());
    setSelectMode(!selectMode);
  };

  const toggleSelected = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === gastos.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(gastos.map((g) => g.id)));
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    hapticImpact('light');
    webAlert(
      `Eliminar ${selectedIds.size} gasto${selectedIds.size !== 1 ? 's' : ''}`,
      'Esta accion no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteGastos([...selectedIds]);
            setSelectedIds(new Set());
            setSelectMode(false);
            loadData();
          },
        },
      ]
    );
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

  const handleEditarPresupuesto = () => {
    if (Platform.OS !== 'web') return;
    const actual = presupuesto ? String(presupuesto) : '';
    const v = window.prompt(
      'Presupuesto mensual en $ (deja vacio para quitarlo):',
      actual
    );
    if (v === null) return;
    const n = parseFloat(v.replace(',', '.'));
    setPresupuestoMensual(n > 0 ? n : null).then(loadData);
  };

  // Filtro de busqueda por comercio, nota, referencia o categoria
  const q = busqueda.trim().toLowerCase();
  const gastosFiltrados = q
    ? gastos.filter((g) =>
        [g.comercio, g.nota, g.referencia, g.categoriaNombre, g.tarjetaNombre]
          .filter(Boolean)
          .some((campo) => (campo as string).toLowerCase().includes(q))
      )
    : gastos;

  // Gastos agrupados por dia, como las apps de finanzas del mercado
  const secciones = (() => {
    const grupos = new Map<string, GastoConDetalles[]>();
    for (const g of gastosFiltrados) {
      const k = (g.fecha || '').split('T')[0];
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(g);
    }
    const hoy = new Date().toISOString().split('T')[0];
    const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    return [...grupos.entries()].map(([fecha, data]) => {
      const d = new Date(fecha + 'T12:00:00');
      const titulo =
        fecha === hoy
          ? 'Hoy'
          : fecha === ayer
            ? 'Ayer'
            : isNaN(d.getTime())
              ? fecha
              : d.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'short' });
      return {
        title: titulo.charAt(0).toUpperCase() + titulo.slice(1),
        totalDia: data.reduce((s, g) => s + g.monto, 0),
        data,
      };
    });
  })();

  const delta = totalAnterior > 0 ? ((total - totalAnterior) / totalAnterior) * 100 : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Mis Gastos</Text>
        <View style={styles.headerActions}>
          {gastos.length > 0 && (
            <Pressable
              onPress={() => {
                hapticImpact('light');
                setBuscando(!buscando);
                if (buscando) setBusqueda('');
              }}
              hitSlop={10}
            >
              <Ionicons
                name={buscando ? 'close-circle' : 'search'}
                size={20}
                color={theme.primary}
              />
            </Pressable>
          )}
          {gastos.length > 0 && (
            <Pressable onPress={toggleSelectMode} hitSlop={10}>
              <Text style={[styles.selectBtn, { color: theme.primary }]}>
                {selectMode ? 'Cancelar' : 'Seleccionar'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {buscando && (
        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search" size={16} color={theme.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Buscar por comercio, nota, referencia..."
            placeholderTextColor={theme.textTertiary}
            value={busqueda}
            onChangeText={setBusqueda}
            autoFocus
          />
        </View>
      )}

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

      <Pressable
        onPress={handleEditarPresupuesto}
        style={[styles.totalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <Text style={[styles.totalLabel, { color: theme.textTertiary }]}>
          GASTADO EN {MESES[mes - 1].toUpperCase()}
        </Text>
        <Text style={[styles.totalAmount, { color: theme.text }]}>${total.toFixed(2)}</Text>

        {delta !== null && (
          <View style={styles.deltaRow}>
            <Ionicons
              name={delta > 0 ? 'arrow-up' : 'arrow-down'}
              size={12}
              color={delta > 0 ? theme.danger : theme.accent}
            />
            <Text style={[styles.deltaText, { color: delta > 0 ? theme.danger : theme.accent }]}>
              {Math.abs(delta).toFixed(0)}% vs {MESES[mes === 1 ? 11 : mes - 2].toLowerCase()}
            </Text>
          </View>
        )}

        {presupuesto ? (
          <View style={styles.presupuestoWrap}>
            <View style={[styles.presupuestoBar, { backgroundColor: theme.surfaceSecondary }]}>
              <View
                style={[
                  styles.presupuestoFill,
                  {
                    width: `${Math.min((total / presupuesto) * 100, 100)}%`,
                    backgroundColor:
                      total > presupuesto
                        ? theme.danger
                        : total > presupuesto * 0.8
                          ? '#D97706'
                          : theme.accent,
                  },
                ]}
              />
            </View>
            <Text style={[styles.presupuestoText, { color: theme.textSecondary }]}>
              {total > presupuesto
                ? `Excedido por $${(total - presupuesto).toFixed(2)} de $${presupuesto.toFixed(0)}`
                : `Quedan $${(presupuesto - total).toFixed(2)} de $${presupuesto.toFixed(0)}`}
            </Text>
          </View>
        ) : (
          <Text style={[styles.presupuestoHint, { color: theme.textTertiary }]}>
            Toca para fijar un presupuesto mensual
          </Text>
        )}

        {resumen.length > 0 && (
          <>
            <View style={styles.stackBar}>
              {resumen.map((cat) => (
                <View
                  key={cat.categoriaId}
                  style={[styles.stackSeg, { backgroundColor: cat.color, flex: Math.max(cat.porcentaje, 2) }]}
                />
              ))}
            </View>
            <View style={styles.legendRow}>
              {resumen.slice(0, 3).map((cat) => (
                <View key={cat.categoriaId} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                  <Text style={[styles.legendText, { color: theme.textSecondary }]} numberOfLines={1}>
                    {cat.nombre} {cat.porcentaje.toFixed(0)}%
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </Pressable>

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

      <SectionList
        sections={secciones}
        keyExtractor={(item) => item.id.toString()}
        stickySectionHeadersEnabled={false}
        renderItem={({ item }) => (
          <GastoItem
            gasto={item}
            selectable={selectMode}
            selected={selectedIds.has(item.id)}
            onPress={
              selectMode
                ? () => toggleSelected(item.id)
                : () => {
                    hapticImpact('light');
                    router.push(`/gasto/${item.id}`);
                  }
            }
            onLongPress={selectMode ? undefined : () => handleDeleteGasto(item)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              {section.title}
            </Text>
            <Text style={[styles.sectionTotal, { color: theme.textTertiary }]}>
              ${section.totalDia.toFixed(2)}
            </Text>
          </View>
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

      {!selectMode && (
        <>
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
        </>
      )}

      {selectMode && (
        <View style={[styles.selectBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Pressable onPress={selectAll} hitSlop={8} style={styles.selectAllBtn}>
            <Ionicons
              name={selectedIds.size === gastos.length ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={theme.primary}
            />
            <Text style={[styles.selectAllText, { color: theme.primary }]}>Todos</Text>
          </Pressable>
          <Text style={[styles.selectCount, { color: theme.textSecondary }]}>
            {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </Text>
          <Pressable
            onPress={handleDeleteSelected}
            style={[
              styles.deleteBtn,
              { backgroundColor: theme.danger, opacity: selectedIds.size === 0 ? 0.4 : 1 },
            ]}
          >
            <Ionicons name="trash" size={15} color="#FFFFFF" />
            <Text style={styles.deleteBtnText}>Eliminar</Text>
          </Pressable>
        </View>
      )}
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
    paddingTop: 8,
    paddingBottom: 4,
  },
  selectBtn: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  presupuestoWrap: {
    alignSelf: 'stretch',
    marginHorizontal: 18,
    marginTop: 10,
  },
  presupuestoBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  presupuestoFill: {
    height: 6,
    borderRadius: 3,
  },
  presupuestoText: {
    fontSize: 11.5,
    marginTop: 5,
    textAlign: 'center',
    fontWeight: '600',
  },
  presupuestoHint: {
    fontSize: 11,
    marginTop: 6,
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
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stackBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    alignSelf: 'stretch',
    marginHorizontal: 18,
    marginTop: 14,
    gap: 2,
  },
  stackSeg: {
    borderRadius: 4,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    marginTop: 14,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  sectionTotal: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
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
  selectBar: {
    position: 'absolute',
    bottom: 96,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectAllText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  selectCount: {
    fontSize: 12.5,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  deleteBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
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
