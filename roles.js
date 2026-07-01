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
  [ROLES.MASTER]:      ['cargas', 'pendientes', 'historial', 'usuarios', 'proveedor', 'maquinaria', 'permisos', 'graficos', 'resumen'],
  [ROLES.ADMIN]:       ['cargas', 'pendientes', 'historial', 'usuarios', 'proveedor', 'maquinaria', 'permisos', 'graficos', 'resumen'],
  [ROLES.COORDINADOR]: ['cargas', 'pendientes', 'historial', 'usuarios', 'proveedor', 'maquinaria', 'permisos'],
  [ROLES.RESIDENTE]:   ['cargas', 'pendientes', 'maquinaria', ...(RESIDENTE_VE_PROVEEDOR ? ['proveedor'] : [])],
  [ROLES.VISOR]:       ['graficos', 'maquinaria', 'resumen'],
};

export function tabsVisibles(rol) {
  return TABS_POR_ROL[rol] || [];
}

/* ───────────────────────────── CARGAS / HISTORIAL ───────────────────────────── */

// LIMPIEZA (bugs.txt / revisión de código muerto): se quitaron
// puedeCapturarCarga(), puedeVerHistorial() y puedeDescargarPDFHistorial().
// Las tres eran funciones fantasma (declaradas, exportadas, pero nunca
// llamadas desde app.js ni index.html): la visibilidad de las pestañas
// 'cargas'/'historial' ya la resuelve tabsVisibles()/TABS_POR_ROL, y la
// captura de cargas y el botón de descargar PDF del historial nunca
// estuvieron condicionados por ellas (el botón de PDF siempre se mostró
// sin gate de rol, y las reglas de Firestore ya bloquean a Visor de
// cualquier forma). Si en el futuro se requiere una restricción real que
// hoy no existe, hay que crear la función Y conectarla a un botón/if.

// Editar un registro YA conciliado: solo Master.
// FIX: esta función SÍ estaba declarada pero antes era fantasma (nadie la
// llamaba) — loadHistory() en app.js ahora la usa para mostrar el botón
// "Editar (conciliado)" solo a Master, cumpliendo Instrucciones.txt punto 1.
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

/* ───────────────────────────── USUARIOS ───────────────────────────── */

export function puedeVerPanelUsuarios(rol) {
  return [ROLES.MASTER, ROLES.ADMIN, ROLES.COORDINADOR].includes(rol);
}

export function puedeCrearUsuarios(rol) {
  // Coordinador NO puede crear usuarios.
  return [ROLES.MASTER, ROLES.ADMIN].includes(rol);
}

// FIX (punto 3 de cambios.md, reforzado con la captura de pantalla del
// panel de Usuarios): antes Admin también podía cambiar roles, lo cual
// dejaba abierta la posibilidad de alterar el rol de otro usuario desde
// una cuenta que no debería poder hacerlo. Ahora SOLO el Máster puede
// cambiar el rol de un usuario ya existente. Al Admin se le sigue
// dejando asignar el rol inicial al CREAR un usuario nuevo (eso se
// controla aparte, en app.js, con opcionesRolDisponibles()).
export function puedeCambiarRoles(rol) {
  return rol === ROLES.MASTER;
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

// Editar una carga de proveedor ya capturada: mismos roles que pueden subirla.
export function puedeEditarProveedor(rol) {
  return puedeSubirProveedor(rol);
}

// Eliminar una carga de proveedor: solo Master (igual que en registros/whitelist).
export function puedeEliminarProveedor(rol) {
  return rol === ROLES.MASTER;
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

// Eliminar maquinaria del catálogo: solo Master (igual que en firestore.rules.txt).
export function puedeEliminarMaquinaria(rol) {
  return rol === ROLES.MASTER;
}

// Documentos legales (Permiso, Factura, DC3, Tarjeta de circulación, Póliza):
// ACTUALIZACIÓN (instrucción más reciente, sobre la captura de pantalla de
// la pestaña "Permisos"): solo subir/reemplazar archivos faltantes queda
// EXCLUSIVO para Admin (Master incluido por jerarquía). El Coordinador ya
// NO puede subir — esto reemplaza la regla anterior donde Coordinador sí
// podía subir. Ver nota en la respuesta sobre este cambio de criterio
// respecto a cambios.md.
export function puedeSubirDocumentosMaquinaria(rol) {
  return [ROLES.ADMIN, ROLES.MASTER].includes(rol);
}

// Ver/descargar el PDF YA SUBIDO de un documento de maquinaria:
//  - Admin y Master: pueden ver/descargar los 5 documentos.
//  - Coordinador: AHORA puede ver/descargar los 5 documentos (antes solo
//    "Permiso"). Lo que NO puede hacer es subir ni eliminar.
//  - Residente y Visor: no ven ningún documento (ya bloqueado por
//    puedeEditarMaquinaria al abrir la ficha en modo lectura).
export function puedeVerDocumentoMaquinaria(rol, campo) {
  return [ROLES.MASTER, ROLES.ADMIN, ROLES.COORDINADOR].includes(rol);
}

// Eliminar un PDF de documento de maquinaria YA subido: EXCLUSIVO para
// Admin (Master incluido por jerarquía). Ni Coordinador ni nadie más.
export function puedeEliminarDocumentoMaquinaria(rol) {
  return [ROLES.ADMIN, ROLES.MASTER].includes(rol);
}

// Pestaña "Permisos" (punto 7.2): quién puede VER la pestaña (consultar
// y, según su rol, subir/descargar/eliminar). Admin, Coordinador y Master
// la ven. Ya NO se amarra a puedeSubirDocumentosMaquinaria porque ahora
// Coordinador puede entrar a ver/descargar aunque no pueda subir.
export function puedeVerPermisos(rol) {
  return [ROLES.MASTER, ROLES.ADMIN, ROLES.COORDINADOR].includes(rol);
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
