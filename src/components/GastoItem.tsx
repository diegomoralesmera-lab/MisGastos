import { View, Text, StyleSheet, Pressable } from 'react-native';
import { GastoConDetalles } from '../types';
import { useTheme } from '../hooks/useColorScheme';

interface Props {
  gasto: GastoConDetalles;
  onLongPress?: () => void;
}

export function GastoItem({ gasto, onLongPress }: Props) {
  const theme = useTheme();
  const fecha = new Date(gasto.fecha + 'T12:00:00');
  const dia = fecha.getDate();
  const mesCorto = fecha.toLocaleDateString('es', { month: 'short' });

  return (
    <Pressable
      onLongPress={onLongPress}
      style={[styles.container, { backgroundColor: theme.surface }]}
    >
      <View style={[styles.iconCircle, { backgroundColor: gasto.categoriaColor + '20' }]}>
        <Text style={styles.icon}>{gasto.categoriaIcono}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.comercio, { color: theme.text }]}>
          {gasto.comercio || gasto.categoriaNombre}
        </Text>
        <View style={styles.metaRow}>
          <View style={[styles.tarjetaBadge, { backgroundColor: gasto.tarjetaColor + '20' }]}>
            <View style={[styles.tarjetaDot, { backgroundColor: gasto.tarjetaColor }]} />
            <Text style={[styles.tarjetaText, { color: theme.textSecondary }]}>
              •••{gasto.tarjetaUltimos4}
            </Text>
          </View>
          <Text style={[styles.fecha, { color: theme.textTertiary }]}>
            {dia} {mesCorto}
          </Text>
        </View>
      </View>
      <Text style={[styles.monto, { color: theme.danger }]}>
        -${gasto.monto.toFixed(2)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 14,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  comercio: {
    fontSize: 15,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  tarjetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  tarjetaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tarjetaText: {
    fontSize: 11,
    fontWeight: '500',
  },
  fecha: {
    fontSize: 12,
  },
  monto: {
    fontSize: 16,
    fontWeight: '700',
  },
});
