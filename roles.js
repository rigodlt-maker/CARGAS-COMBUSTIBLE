// =============================================
// js/roles.js — Matriz central de roles y permisos
// =============================================
// Este módulo es la ÚNICA fuente de verdad sobre qué puede ver/hacer
// cada rol. El resto de módulos (cargas.js, maquinaria.js, proveedor.js,
// resumen.js, dashboard.js, usuarios.js) deben importar de aquí en vez
// de repetir condicionales "if (rol === ...)" sueltos por el código.

export const ROLES = {
  MASTER: 'master',
  ADMIN: 'admin',
  COORDINADOR: 'coordinador',
  RESIDENTE: 'residente',
  VISOR: 'visor',
};

// Rango numérico — útil para comparar "igual o menor que" en el panel de Usuarios.
export const RANGO = {
  [ROLES.MASTER]: 5,
  [ROLES.ADMIN]: 4,
  [ROLES.COORDINADOR]: 3,
  [ROLES.RESIDENTE]: 2,
  [ROLES.VISOR]: 1,
};

// Bandera de control: el Residente NO ve "Proveedor" todavía, pero el
// código ya está listo para habilitarlo el día que se decida (punto 4.1
// de los requerimientos: "déjalo medio habilitado por si luego quiero
// darle permiso de subir información ahí").
export const RESIDENTE_VE_PROVEEDOR = false;
export const RESIDENTE_SUBE_PROVEEDOR = false;

// Pestañas visibles por rol. 'cargas' (antes "Registro") y 'maquinaria'
// son comunes a todos los roles activos excepto donde se indica.
export const TABS_POR_ROL = {
  [ROLES.MASTER]:      ['cargas', 'pendientes', 'historial', 'usuarios', 'proveedor', 'maquinaria', 'graficos', 'resumen'],
  [ROLES.ADMIN]:       ['cargas', 'pendientes', 'historial', 'usuarios', 'proveedor', 'maquinaria', 'graficos', 'resumen'],
  [ROLES.COORDINADOR]: ['cargas', 'pendientes', 'historial', 'usuarios', 'proveedor', 'maquinaria'],
  [ROLES.RESIDENTE]:   ['cargas', 'pendientes', 'maquinaria', ...(RESIDENTE_VE_PROVEEDOR ? ['proveedor'] : [])],
  [ROLES.VISOR]:       ['graficos', 'maquinaria', 'resumen'],
};

export function tabsVisibles(rol) {
  return TABS_POR_ROL[rol] || [];
}

/* ───────────────────────────── CARGAS / HISTORIAL ───────────────────────────── */

export function puedeCapturarCarga(rol) {
  return rol !== ROLES.VISOR;
}

export function puedeVerHistorial(rol) {
  return rol !== ROLES.VISOR;
}

// Editar un registro YA conciliado: solo Master.
export function puedeEditarConciliado(rol) {
  return rol === ROLES.MASTER;
}

// Editar un registro NO conciliado: Coordinador, Admin, Master
// (Residente solo puede tocar sus propios registros en estado "pendiente",
// eso se valida con el dueño del registro, no solo con el rol).
export function puedeEditarNoConciliado(rol) {
  return [ROLES.COORDINADOR, ROLES.ADMIN, ROLES.MASTER].includes(rol);
}

export function puedeConciliar(rol) {
  return rol === ROLES.MASTER;
}

export function puedeDescargarPDFHistorial(rol) {
  return [ROLES.COORDINADOR, ROLES.ADMIN, ROLES.MASTER].includes(rol);
}

/* ───────────────────────────── USUARIOS ───────────────────────────── */

export function puedeVerPanelUsuarios(rol) {
  return [ROLES.MASTER, ROLES.ADMIN, ROLES.COORDINADOR].includes(rol);
}

export function puedeCrearUsuarios(rol) {
  // Coordinador NO puede crear usuarios.
  return [ROLES.MASTER, ROLES.ADMIN].includes(rol);
}

export function puedeCambiarRoles(rol) {
  return [ROLES.MASTER, ROLES.ADMIN].includes(rol);
}

export function puedeCambiarContrasenas(rol) {
  // Cambio rápido de contraseña ("alguien perdió la suya"): solo Master.
  // Admin puede asignar contraseña SOLO al momento de crear el usuario (punto 2.1).
  return rol === ROLES.MASTER;
}

export function puedeEliminarUsuarios(rol) {
  return rol === ROLES.MASTER;
}

// Determina qué usuarios puede VER un Admin o Coordinador en la lista.
// Master ve a todos. Admin ve rango <= al suyo. Coordinador ve rango <= al
// suyo pero el Master nunca debe aparecerle en la lista.
export function filtraUsuariosVisibles(rolViewer, listaUsuarios) {
  if (rolViewer === ROLES.MASTER) return listaUsuarios;

  const miRango = RANGO[rolViewer] || 0;
  return listaUsuarios.filter(u => {
    const rangoObjetivo = RANGO[u.rol] || 0;
    if (rolViewer === ROLES.COORDINADOR && u.rol === ROLES.MASTER) return false;
    return rangoObjetivo <= miRango;
  });
}

// Un usuario creado por Admin queda pendiente de validación del Master
// ANTES de poder operar con privilegios elevados; sin embargo, por
// instrucción explícita, el rol "residente" creado por un Admin ya puede
// capturar de inmediato (no se bloquea su acceso a Cargas mientras se
// valida formalmente en el panel de Usuarios).
export function usuarioPuedeOperar(usuario) {
  if (usuario.activo !== true) return false;
  if (usuario.validado === false && usuario.rol !== ROLES.RESIDENTE) return false;
  return true;
}

/* ───────────────────────────── PROVEEDOR ───────────────────────────── */

export function puedeVerProveedor(rol) {
  if ([ROLES.MASTER, ROLES.ADMIN, ROLES.COORDINADOR].includes(rol)) return true;
  if (rol === ROLES.RESIDENTE) return RESIDENTE_VE_PROVEEDOR;
  return false;
}

export function puedeSubirProveedor(rol) {
  if ([ROLES.MASTER, ROLES.ADMIN, ROLES.COORDINADOR].includes(rol)) return true;
  if (rol === ROLES.RESIDENTE) return RESIDENTE_SUBE_PROVEEDOR;
  return false;
}

/* ───────────────────────────── MAQUINARIA ───────────────────────────── */

export function puedeVerMaquinaria(rol) {
  return true; // todos los roles activos tienen acceso de lectura
}

export function puedeAgregarMaquinaria(rol) {
  return [ROLES.COORDINADOR, ROLES.ADMIN, ROLES.MASTER].includes(rol);
}

export function puedeEditarMaquinaria(rol) {
  return [ROLES.COORDINADOR, ROLES.ADMIN, ROLES.MASTER].includes(rol);
}

// Documentos legales (Permiso, Factura, DC3, Tarjeta de circulación, Póliza):
// solo Admin y Coordinador (instrucción explícita; Master incluido por jerarquía).
export function puedeSubirDocumentosMaquinaria(rol) {
  return [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.MASTER].includes(rol);
}

/* ───────────────────────────── RESUMEN / DASHBOARD / GRÁFICOS ───────────────────────────── */

export function puedeVerResumen(rol) {
  return [ROLES.MASTER, ROLES.ADMIN, ROLES.VISOR].includes(rol);
}

export function puedeDescargarPDFResumen(rol) {
  // Punto 5: el Visor SÍ puede descargar los PDF de Resumen aunque no edite nada más.
  return [ROLES.MASTER, ROLES.ADMIN, ROLES.VISOR].includes(rol);
}

export function puedeVerDashboardKPIs(rol) {
  return [ROLES.MASTER, ROLES.ADMIN, ROLES.VISOR].includes(rol);
}

export const ETIQUETAS_ROL = {
  [ROLES.MASTER]: '🔑 Master',
  [ROLES.ADMIN]: '🛡️ Admin',
  [ROLES.COORDINADOR]: '🧭 Coordinador',
  [ROLES.RESIDENTE]: '👷 Residente',
  [ROLES.VISOR]: '📊 Visor',
};
