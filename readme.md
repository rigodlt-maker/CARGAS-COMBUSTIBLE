# FuelControl PWA — Rompeolas Oriente
## ASPN-GI-CO-62601-016-25 · Control de Combustibles y Rendimientos

---

## 📁 Estructura real del repositorio

```
CARGAS-COMBUSTIBLE/
├── index.html          ← App principal (PWA shell), define TODAS las pantallas/tabs
├── style.css            ← Estilos (paleta oscura industrial: carbón + naranja diésel)
├── app.js               ← TODA la lógica: auth, Firestore, Storage, PDFs, roles, dashboard...
├── roles.js             ← Única fuente de verdad de la matriz de permisos por rol
├── manifest.json        ← PWA manifest (permite "Instalar app")
├── service-worker.js    ← Cache offline
├── icon-192.png / icon-512.png
└── functions/
    ├── index.js         ← Cloud Function `resetUserPassword` (Admin SDK)
    ├── package.json
    └── package-lock.json
```

> ⚠️ `index.html` solo carga `app.js` (`<script type="module" src="app.js">`), y `app.js` solo
> importa `roles.js`. Todo lo demás vive en esos dos archivos — no hay más módulos activos.

---

## 🔑 Configuración de Firebase

La configuración (`apiKey`, `projectId`, etc.) está embebida dentro de `app.js`, función que
inicializa Firebase cerca de la línea 290. Proyecto actual: **`cargas-7bf25`**.

> 🔒 Estas credenciales son públicas por diseño (cualquier app web las expone en el navegador).
> Lo que realmente protege los datos son las **reglas de seguridad de Firestore/Storage** y la
> whitelist de usuarios.

---

## 👥 Roles del sistema (ver `roles.js`)

| Rol | Acceso |
|---|---|
| **Master** | Todo. Único que puede editar historial ya conciliado, eliminar usuarios/maquinaria/proveedor, y resetear contraseñas de cualquier usuario. |
| **Admin** | Cargas, Pendientes, Historial (edita antes de conciliar), Usuarios (ve rango ≤ el suyo, crea usuarios que el Master debe validar), Proveedor, Maquinaria (sube los 5 documentos y los ve/descarga todos), Permisos, Gráficos, Resumen. |
| **Coordinador** | Cargas, Pendientes, Historial (edita y descarga PDF, no concilia), Usuarios (sin ver a Master, sin crear/cambiar roles/contraseñas), Proveedor, Maquinaria (sube documentos pero solo ve/descarga "Permiso"), Permisos. |
| **Residente** | Cargas, Pendientes, Maquinaria (solo lectura), Proveedor (solo lectura, ver `RESIDENTE_SUBE_PROVEEDOR` en `roles.js` si se quiere habilitar la subida). |
| **Visor** | Gráficos, Maquinaria (solo lectura), Resumen (incluye descarga de PDF del Resumen). |

---

## 🗂 Pestañas de la app

| Pestaña | Función principal en `app.js` |
|---|---|
| Cargas | `handleSubmit`, formulario de carga con horómetro/foto/Andon |
| Pendientes | `loadPendientes` — tickets sin folio definitivo |
| Historial | `loadHistory` — edición y conciliación |
| Usuarios | `loadUsuarios` — alta/baja/rango/contraseña |
| Proveedor | `loadProveedor` — conciliación diaria por tipo de combustible (Diésel/Magna/Premium), PDF con tickets |
| Maquinaria | `loadMaquinaria` — catálogo, documentos, histórico de zonas |
| Permisos | `loadPermisos` — estado de documentos (falta/vencido/por vencer) de cada máquina |
| Gráficos | `loadDashboard` — KPIs bajo/medio/alto, barras por zona/subzona, tabla por tipo |
| Resumen | `loadResumen` — barras de rendimiento + equipos activos (Propia/Rentada), PDF ejecutivo |

---

## ⚡ Lógica del horómetro y alertas Andon

- El horómetro acepta formato `XXXX.N` donde el último dígito representa fracción de hora
  (`3421.6` → 3421h 36min).
- **Alertas Andon** (`app.js`, sección "ALERTAS ANDON"): se dispara advertencia si una carga
  excede la capacidad del tanque, o si excede el consumo estimado según horas trabajadas ×
  consumo promedio, con un margen de tolerancia (`ANDON_TOLERANCIA = 1.10`, es decir 10%).
  Si el usuario confirma de todos modos, el PDF de esa carga incluye una leyenda de
  inconsistencia.

---

## ☁️ Despliegue de Cloud Functions

La única función activa hoy es `resetUserPassword` (permite al Master resetear la contraseña
de cualquier usuario sin cerrar su propia sesión; valida en el servidor que quien llama sea
Master activo).

```bash
# 1. Instalar Firebase CLI (o usar npx firebase-tools si el PATH da problemas en Windows)
npm install -g firebase-tools

# 2. Login
firebase login          # o: npx firebase-tools login

# 3. Dentro de la raíz del repo (donde está la carpeta functions/)
cd functions
npm install
cd ..

# 4. Deploy
firebase deploy --only functions      # o: npx firebase-tools deploy --only functions
```

> Requiere el plan **Blaze** (pago por uso) activado en el proyecto de Firebase — la capa
> gratuita de invocaciones cubre por completo el uso normal de esta función.

Para verificar que quedó desplegada: consola de Firebase → *Compilación → Functions* →
`https://console.firebase.google.com/project/cargas-7bf25/functions`

---

## 🌐 Hosting

La app está publicada como sitio estático (GitHub Pages: `rigodlt-maker.github.io`), apuntando
directamente a los archivos de la raíz del repo (`index.html`, `app.js`, `style.css`, etc.). La
carpeta `functions/` **no** se despliega ahí — solo se usa para `firebase deploy --only functions`.

Si en algún momento se prefiere usar Firebase Hosting en vez de GitHub Pages:
```bash
firebase init hosting
# Public directory: . (raíz)
# Configure as SPA: No
firebase deploy --only hosting
```

---

## 📱 Instalar como PWA en dispositivo

1. Abrir la URL en **Chrome** (Android) o **Safari** (iOS)
2. Android: Menú → "Agregar a pantalla de inicio"
3. iOS: Compartir → "Agregar a pantalla de inicio"

---

## 📊 Estructura de Firestore (colecciones reales)

- **`whitelist`** — usuarios: `email`, `rol`, `activo`, `validado`
- **`registros`** — cargas de combustible: `eco`, `fecha`, `tipoCombustible`, `litros`,
  `horometroRaw`, `rendimiento`, `zona` (al momento de la carga), `pdfUrl`, `usuario`, etc.
- **`proveedor_cargas`** — suministro diario: `fecha`, `tipoCombustible`, `litros`, `precio`,
  `ticket`, `fotoTicket`
- **`maquinaria`** — catálogo: `tipo`, `marca`, `modelo`, `eco`, `numInterno`, `zona`, `subzona`,
  `propiedad` (Propia/Rentada), `capacidadTanque`, `consumoBajo/Medio/Alto/Promedio`,
  `documentos.{permiso|factura|dc3|tarjetaCirculacion|poliza}`, `activa`
  - subcolección `historialZonas` — append-only, registra cambios de zona/subzona (para no
    mezclar el consumo de una máquina entre zonas distintas)

---

## ✅ Estado de los 9 puntos de requerimientos originales

Todos implementados a nivel de código (roles, cargas, proveedor con conciliación, maquinaria
con documentos y zonas, permisos, resumen, dashboard/gráficos, alertas Andon). Ver historial de
commits y las conversaciones de seguimiento para el detalle de cada decisión de negocio tomada
(tolerancia Andon, si Residente ve/sube Proveedor, etc.).

## 🔴 Pendiente

- Pruebas de campo con operadores reales.
- Revisar reglas de seguridad de Firestore/Storage (`firestore.rules`, `storage.rules`) contra
  la matriz de roles actual antes de considerar el sistema cerrado a nivel de seguridad.

---

## 📞 Soporte

Proyecto: Rompeolas Oriente — ASPN-GI-CO-62601-016-25
Módulo: Control de Combustibles y Rendimientos
