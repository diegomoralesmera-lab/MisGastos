export interface Tarjeta {
  id: number;
  nombre: string;
  ultimos4: string;
  color: string;
  tipo: 'credito' | 'debito';
  fechaCorte?: number;
  limiteCredito?: number;
  createdAt: string;
}

export interface Categoria {
  id: number;
  nombre: string;
  icono: string;
  color: string;
}

export interface Gasto {
  id: number;
  monto: number;
  fecha: string;
  nota?: string;
  comercio?: string;
  tarjetaId: number;
  categoriaId: number;
  createdAt: string;
}

export interface GastoConDetalles extends Gasto {
  tarjetaNombre: string;
  tarjetaColor: string;
  tarjetaUltimos4: string;
  categoriaNombre: string;
  categoriaIcono: string;
  categoriaColor: string;
}

export interface Presupuesto {
  id: number;
  categoriaId: number;
  montoLimite: number;
  mes: number;
  ano: number;
}

export interface ResumenCategoria {
  categoriaId: number;
  nombre: string;
  icono: string;
  color: string;
  total: number;
  porcentaje: number;
}
