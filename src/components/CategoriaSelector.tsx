import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Categoria } from '../types';
import { useTheme } from '../hooks/useColorScheme';

interface Props {
  categorias: Categoria[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function CategoriaSelector({ categorias, selectedId, onSelect }: Props) {
  const theme = useTheme();

  return (
    <ScrollView
      contentContainerStyle={styles.grid}
      showsVerticalScrollIndicator={false}
    >
      {categorias.map((cat) => {
        const selected = cat.id === selectedId;
        return (
          <Pressable
            key={cat.id}
            onPress={() => onSelect(cat.id)}
            style={[
              styles.item,
              {
                backgroundColor: selected ? cat.color + '20' : theme.surfaceSecondary,
                borderColor: selected ? cat.color : 'transparent',
                borderWidth: 2,
              },
            ]}
          >
            <Text style={styles.icon}>{cat.icono}</Text>
            <Text
              style={[
                styles.label,
                { color: selected ? cat.color : theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {cat.nombre}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    width: '22%',
    minWidth: 72,
    flexGrow: 1,
  },
  icon: {
    fontSize: 26,
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
