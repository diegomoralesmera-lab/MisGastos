import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useColorScheme';
import { getResumenMes, getTotalMes, getGastosMes } from '../../db/database';
import { ResumenCategoria } from '../../types';

export default function EstadisticasScreen() {
  const theme = useTheme();
  const now = new Date();
  const [mes] = useState(now.getMonth() + 1);
  const [ano] = useState(now.getFullYear());
  const [resumen, setResumen] = useState<ResumenCategoria[]>([]);
  const [total, setTotal] = useState(0);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [resumenData, totalData] = await Promise.all([
          getResumenMes(mes, ano),
          getTotalMes(mes, ano),
        ]);
        setResumen(resumenData);
        setTotal(totalData);
      })();
    }, [mes, ano])
  );

  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  const handleExportarCSV = async () => {
    if (Platform.OS !== 'web') return;
    const gastos = await getGastosMes(mes, ano);
    const filas = [
      'Fecha;Comercio;Categoria;Tarjeta;Monto;Referencia;Nota',
      ...gastos.map((g) =>
        [
          g.fecha,
          g.comercio || '',
          g.categoriaNombre,
          `${g.tarjetaNombre}${g.tarjetaUltimos4 !== '0000' ? ' *' + g.tarjetaUltimos4 : ''}`,
          g.monto.toFixed(2),
          g.referencia || '',
          (g.nota || '').replace(/;/g, ','),
        ].join(';')
      ),
      `;;;TOTAL;${total.toFixed(2)};;`,
    ];
    const blob = new Blob(['﻿' + filas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gastos-${ano}-${String(mes).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Reportes</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {MESES[mes - 1]} {ano}
          </Text>
        </View>
        {resumen.length > 0 && (
          <Pressable
            onPress={handleExportarCSV}
            style={[styles.exportBtn, { backgroundColor: theme.primaryLight }]}
          >
            <Ionicons name="download-outline" size={15} color={theme.primary} />
            <Text style={[styles.exportText, { color: theme.primary }]}>Exportar</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {resumen.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>📊</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Sin datos este mes
            </Text>
          </View>
        ) : (
          <>
            {/* Donut visual simplificado */}
            <View style={[styles.donutContainer, { backgroundColor: theme.surface }]}>
              <View style={styles.donutCenter}>
                <Text style={[styles.donutTotal, { color: theme.text }]}>
                  ${total.toFixed(2)}
                </Text>
                <Text style={[styles.donutLabel, { color: theme.textSecondary }]}>
                  Total
                </Text>
              </View>
              <View style={styles.barsRow}>
                {resumen.map((cat) => (
                  <View
                    key={cat.categoriaId}
                    style={[
                      styles.bar,
                      {
                        backgroundColor: cat.color,
                        flex: cat.porcentaje,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>

            {/* Lista de categorias */}
            {resumen.map((cat) => (
              <View
                key={cat.categoriaId}
                style={[styles.catRow, { backgroundColor: theme.surface }]}
              >
                <View style={[styles.catIcon, { backgroundColor: cat.color + '20' }]}>
                  <Text style={styles.catEmoji}>{cat.icono}</Text>
                </View>
                <View style={styles.catInfo}>
                  <Text style={[styles.catName, { color: theme.text }]}>{cat.nombre}</Text>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor: cat.color,
                          width: `${cat.porcentaje}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
                <View style={styles.catAmounts}>
                  <Text style={[styles.catTotal, { color: theme.text }]}>
                    ${cat.total.toFixed(2)}
                  </Text>
                  <Text style={[styles.catPct, { color: theme.textTertiary }]}>
                    {cat.porcentaje.toFixed(0)}%
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
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
    paddingBottom: 12,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  exportText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  content: {
    paddingBottom: 100,
  },
  donutContainer: {
    marginHorizontal: 16,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  donutCenter: {
    alignItems: 'center',
    marginBottom: 20,
  },
  donutTotal: {
    fontSize: 32,
    fontWeight: '800',
  },
  donutLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  barsRow: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    width: '100%',
    gap: 2,
  },
  bar: {
    borderRadius: 5,
    minWidth: 4,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 4,
    padding: 14,
    borderRadius: 14,
  },
  catIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catEmoji: {
    fontSize: 20,
  },
  catInfo: {
    flex: 1,
    marginLeft: 12,
  },
  catName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  progressBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  progressFill: {
    height: 5,
    borderRadius: 3,
  },
  catAmounts: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  catTotal: {
    fontSize: 15,
    fontWeight: '700',
  },
  catPct: {
    fontSize: 11,
    marginTop: 2,
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
});
