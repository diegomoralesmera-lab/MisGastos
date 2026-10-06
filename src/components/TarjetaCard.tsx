import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Tarjeta } from '../types';

interface Props {
  tarjeta: Tarjeta;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function TarjetaCard({ tarjeta, onPress, onLongPress }: Props) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress}>
      <View style={[styles.card, { backgroundColor: tarjeta.color }]}>
        <View style={styles.top}>
          <Text style={styles.tipo}>
            {tarjeta.tipo === 'credito' ? 'CREDITO' : 'DEBITO'}
          </Text>
          <Text style={styles.nombre}>{tarjeta.nombre}</Text>
        </View>
        <Text style={styles.numero}>•••• •••• •••• {tarjeta.ultimos4}</Text>
        {tarjeta.tipo === 'credito' && tarjeta.fechaCorte && (
          <Text style={styles.corte}>Corte: dia {tarjeta.fechaCorte}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 22,
    marginHorizontal: 16,
    marginVertical: 6,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tipo: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  nombre: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  numero: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 20,
    fontWeight: '500',
    letterSpacing: 2,
    marginTop: 20,
  },
  corte: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 8,
  },
});
