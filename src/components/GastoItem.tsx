import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { GastoConDetalles } from '../types';
import { useTheme } from '../hooks/useColorScheme';

interface Props {
  gasto: GastoConDetalles;
  onLongPress?: () => void;
}

export function GastoItem({ gasto, onLongPress }: Props) {
  const theme = useTheme();
  const fechaStr = (gasto.fecha || '').split('T')[0];
  const fecha = new Date(fechaStr + 'T12:00:00');
  const fechaCorta = isNaN(fecha.getTime())
    ? ''
    : fecha.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });

  const descripcion = gasto.nota;
  const tieneTarjeta = gasto.tarjetaUltimos4 && gasto.tarjetaUltimos4 !== '0000';

  return (
    <Pressable
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: gasto.categoriaColor + '1A' }]}>
        <Text style={styles.icon}>{gasto.categoriaIcono}</Text>
      </View>

      <View style={styles.info}>
        <Text style={[styles.comercio, { color: theme.text }]} numberOfLines={1}>
          {gasto.comercio || gasto.categoriaNombre}
        </Text>

        {descripcion ? (
          <Text style={[styles.descripcion, { color: theme.textSecondary }]} numberOfLines={1}>
            {descripcion}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          <View style={[styles.tarjetaDot, { backgroundColor: gasto.tarjetaColor }]} />
          <Text style={[styles.metaText, { color: theme.textTertiary }]} numberOfLines={1}>
            {gasto.tarjetaNombre}
            {tieneTarjeta ? ` ••${gasto.tarjetaUltimos4}` : ''}
            {gasto.referencia ? `  ·  ${gasto.referencia}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.right}>
        <Text style={[styles.monto, { color: theme.text }]}>
          -${gasto.monto.toFixed(2)}
        </Text>
        <Text style={[styles.fecha, { color: theme.textTertiary }]}>{fechaCorta}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginVertical: 3,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
  },
  info: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  comercio: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  descripcion: {
    fontSize: 12.5,
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 5,
  },
  tarjetaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metaText: {
    fontSize: 11,
    flexShrink: 1,
    ...Platform.select({ web: { fontVariant: ['tabular-nums'] as any }, default: {} }),
  },
  right: {
    alignItems: 'flex-end',
  },
  monto: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  fecha: {
    fontSize: 11,
    marginTop: 2,
  },
});
