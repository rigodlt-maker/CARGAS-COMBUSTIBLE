// =============================================
// js/state.js — Estado global compartido entre módulos
// =============================================
// Antes estas variables vivían sueltas en app.js (currentUser, isAdmin,
// isMaster, currentStep, etc.). Ahora viven aquí en un solo objeto para
// que cualquier módulo pueda leerlas/escribirlas sin pasarse parámetros
// de un lado a otro ni generar imports circulares.

export const AppState = {
  // --- Sesión ---
  currentUser: null,
  rol: null,           // 'master' | 'admin' | 'coordinador' | 'residente' | 'visor'
  isAdmin: false,       // true si rol es 'admin' o 'master' (compatibilidad con código viejo)
  isMaster: false,      // true si rol es 'master'

  // --- Formulario de Cargas (antes "Registro") ---
  currentStep: 1,
  dataFotos: { ini: null, fin: null, ticket: null, pend: null, horo: null },
  estadoFotos: { ini: false, fin: false, ticket: false, pend: false, horo: false },

  // --- Catálogos cargados de Firestore (maquinaria, equipos, etc.) ---
  catalogoEquipos: [],
};

/* ─────────────────────────────────────────────────────────────────
   CACHÉS DE LISTAS — Historial / Pendientes / Usuarios / Maquinaria
   ─────────────────────────────────────────────────────────────────
   Cada vez que se pinta una tarjeta en una lista, se guarda el objeto
   completo aquí con su id como llave. Así, al abrir un modal de
   detalle/edición o al generar un PDF desde la lista, no hace falta
   volver a pedirle el documento a Firestore: ya lo tenemos en memoria.
───────────────────────────────────────────────────────────────── */
const cache = {
  historial: {},
  pendientes: {},
  usuarios: {},
  maquinaria: {},
};

export function setCache(tipo, id, data) {
  if (!cache[tipo]) cache[tipo] = {};
  cache[tipo][id] = data;
}

export function getCache(tipo, id) {
  return cache[tipo]?.[id];
}

export function resetCache(tipo) {
  cache[tipo] = {};
}

// --- Atajos de compatibilidad (pdf.js usa específicamente este) ---
// Busca el registro primero en historial, luego en pendientes, ya que
// el botón de descarga de PDF aparece en ambas listas.
export function getRegistroCache(id) {
  return cache.historial[id] || cache.pendientes[id];
}

export function setRegistroCache(tipo, id, data) {
  setCache(tipo, id, data);
}
