import { Platform } from 'react-native';
import { DEFAULT_CATEGORIES } from '../constants/categories';
import { Tarjeta, Categoria, Gasto, GastoConDetalles, ResumenCategoria } from '../types';

interface AppData {
  tarjetas: Tarjeta[];
  gastos: Gasto[];
  categorias: Categoria[];
  nextTarjetaId: number;
  nextGastoId: number;
}

function getDefaultData(): AppData {
  const categorias: Categoria[] = DEFAULT_CATEGORIES.map((cat, i) => ({
    ...cat,
    id: i + 1,
  }));
  return {
    tarjetas: [],
    gastos: [],
    categorias,
    nextTarjetaId: 1,
    nextGastoId: 1,
  };
}

function loadData(): AppData {
  try {
    const raw = localStorage.getItem('misgastos_data');
    if (raw) return JSON.parse(raw);
  } catch {}
  const data = getDefaultData();
  saveData(data);
  return data;
}

function saveData(data: AppData): void {
  try {
    localStorage.setItem('misgastos_data', JSON.stringify(data));
  } catch {}
}

let _data: AppData | null = null;

function getData(): AppData {
  if (!_data) _data = loadData();
  return _data;
}

function persist(): void {
  if (_data) saveData(_data);
}

// --- Tarjetas ---

export async function getTarjetas(): Promise<Tarjeta[]> {
  return [...getData().tarjetas].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function insertTarjeta(
  tarjeta: Omit<Tarjeta, 'id' | 'createdAt'>
): Promise<number> {
  const data = getData();
  const id = data.nextTarjetaId++;
  data.tarjetas.push({
    ...tarjeta,
    id,
    createdAt: new Date().toISOString(),
  });
  persist();
  return id;
}

export async function deleteTarjeta(id: number): Promise<void> {
  const data = getData();
  data.tarjetas = data.tarjetas.filter((t) => t.id !== id);
  data.gastos = data.gastos.filter((g) => g.tarjetaId !== id);
  persist();
}

// --- Categorias ---

export async function getCategorias(): Promise<Categoria[]> {
  return [...getData().categorias].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// --- Gastos ---

export async function insertGasto(
  gasto: Omit<Gasto, 'id' | 'createdAt'>
): Promise<number> {
  const data = getData();
  const id = data.nextGastoId++;
  data.gastos.push({
    ...gasto,
    id,
    createdAt: new Date().toISOString(),
  });
  persist();
  return id;
}

export async function getGastosMes(mes: number, ano: number): Promise<GastoConDetalles[]> {
  const data = getData();
  const mesStr = String(mes).padStart(2, '0');
  const prefix = `${ano}-${mesStr}`;

  return data.gastos
    .filter((g) => g.fecha.startsWith(prefix))
    .map((g) => {
      const tarjeta = data.tarjetas.find((t) => t.id === g.tarjetaId);
      const categoria = data.categorias.find((c) => c.id === g.categoriaId);
      return {
        ...g,
        tarjetaNombre: tarjeta?.nombre ?? '',
        tarjetaColor: tarjeta?.color ?? '#666',
        tarjetaUltimos4: tarjeta?.ultimos4 ?? '0000',
        categoriaNombre: categoria?.nombre ?? '',
        categoriaIcono: categoria?.icono ?? '📌',
        categoriaColor: categoria?.color ?? '#666',
      };
    })
    .sort((a, b) => {
      const dateCompare = b.fecha.localeCompare(a.fecha);
      if (dateCompare !== 0) return dateCompare;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export async function getResumenMes(mes: number, ano: number): Promise<ResumenCategoria[]> {
  const data = getData();
  const mesStr = String(mes).padStart(2, '0');
  const prefix = `${ano}-${mesStr}`;

  const gastosMes = data.gastos.filter((g) => g.fecha.startsWith(prefix));
  const totalesPorCat = new Map<number, number>();

  for (const g of gastosMes) {
    totalesPorCat.set(g.categoriaId, (totalesPorCat.get(g.categoriaId) ?? 0) + g.monto);
  }

  const grandTotal = gastosMes.reduce((sum, g) => sum + g.monto, 0);

  const rows: ResumenCategoria[] = [];
  for (const [catId, total] of totalesPorCat) {
    const cat = data.categorias.find((c) => c.id === catId);
    if (cat && total > 0) {
      rows.push({
        categoriaId: catId,
        nombre: cat.nombre,
        icono: cat.icono,
        color: cat.color,
        total,
        porcentaje: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      });
    }
  }

  return rows.sort((a, b) => b.total - a.total);
}

export async function getTotalMes(mes: number, ano: number): Promise<number> {
  const data = getData();
  const mesStr = String(mes).padStart(2, '0');
  const prefix = `${ano}-${mesStr}`;
  return data.gastos
    .filter((g) => g.fecha.startsWith(prefix))
    .reduce((sum, g) => sum + g.monto, 0);
}

export async function deleteGasto(id: number): Promise<void> {
  const data = getData();
  data.gastos = data.gastos.filter((g) => g.id !== id);
  persist();
}
