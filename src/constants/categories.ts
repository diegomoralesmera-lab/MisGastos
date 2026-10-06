import { Categoria } from '../types';

export const DEFAULT_CATEGORIES: Omit<Categoria, 'id'>[] = [
  { nombre: 'Comida', icono: '🍔', color: '#F59E0B' },
  { nombre: 'Transporte', icono: '🚗', color: '#3B82F6' },
  { nombre: 'Entretenimiento', icono: '🎬', color: '#8B5CF6' },
  { nombre: 'Salud', icono: '💊', color: '#EF4444' },
  { nombre: 'Ropa', icono: '👕', color: '#EC4899' },
  { nombre: 'Hogar', icono: '🏠', color: '#10B981' },
  { nombre: 'Educacion', icono: '📚', color: '#6366F1' },
  { nombre: 'Servicios', icono: '💡', color: '#F97316' },
  { nombre: 'Supermercado', icono: '🛒', color: '#14B8A6' },
  { nombre: 'Suscripciones', icono: '📱', color: '#7C3AED' },
  { nombre: 'Viajes', icono: '✈️', color: '#0EA5E9' },
  { nombre: 'Otro', icono: '📌', color: '#6B7280' },
];
