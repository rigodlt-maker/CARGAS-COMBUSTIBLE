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

La configuración (`apiKey`, `projectId`, etc.) está embebida dentro de `app.js`, función
`loadFirebase()` cerca de la línea 300. Proyecto actual: **`cargas-7bf25`**. Todos los imports
del SDK usan la misma versión fija (`firebasejs/11.9.0`) — auth, firestore, functions y storage.

> 🔒 Estas credenciales son públicas por diseño (cualquier app web las expone en el navegador).
> Lo que realmente protege los datos son las **reglas de seguridad de Firestore/Storage** y la
> whitelist de usuarios.

---

## 👥 Roles del sistema (ver `roles.js`)

| Rol | Acceso |
|---|---|
| **Master** | Todo. Único que puede editar historial **incluso ya conciliado**, eliminar registros/usuarios/maquinaria/proveedor, y resetear contraseñas de cualquier usuario. |
| **Admin** | Cargas, Pendientes, Historial (edita antes de conciliar), Usuarios (ve rango ≤ el suyo, crea usuarios que el Master debe validar), Proveedor, Maquinaria (sube, ve y elimina los 5 documentos), Permisos, Gráficos, Resumen. |
| **Coordinador** | Cargas, Pendientes, Historial (edita y descarga PDF, no concilia), Usuarios (sin ver a Master, sin crear/cambiar roles/contraseñas), Proveedor, Maquinaria (**ve/descarga los 5 documentos, ya NO puede subirlos ni eliminarlos** — exclusivo de Admin/Master), Permisos. |
| **Residente** | Cargas, Pendientes, Maquinaria (solo lectura), Proveedor (solo lectura; ver `RESIDENTE_SUBE_PROVEEDOR` en `roles.js` si se quiere habilitar la subida). |
| **Visor** | Gráficos, Maquinaria (solo lectura), Resumen (incluye rendimientos y descarga de PDF — requiere que `registros` sea legible para Visor en `firestore.rules`, ver sección de Seguridad). |

---

## 🗂 Pestañas de la app

| Pestaña | Función principal en `app.js` |
|---|---|
| Cargas | `handleSubmit`, formulario de carga con horómetro/foto/Andon |
| Pendientes | `loadPendientes` — tickets sin folio definitivo |
| Historial | `loadHistory` — edición, conciliación y eliminación (Master) |
| Usuarios | `loadUsuarios` — alta/baja/rango/contraseña |
| Proveedor | `loadProveedor` — conciliación diaria por tipo de combustible (Diésel/Magna/Premium), PDF con tickets |
| Maquinaria | `loadMaquinaria` — catálogo, documentos, histórico de zonas |
| Permisos | `loadPermisos` — estado de documentos (falta/vencido/por vencer, con contador de días) de cada máquina |
| Gráficos | `loadDashboard` — KPIs bajo/medio/alto (clicables → detalle por máquina), barras por zona/subzona, tabla por tipo |
| Resumen | `loadResumen` — barras de rendimiento + equipos activos (Propia/Rentada), PDF ejecutivo |

---

## ⚡ Lógica del horómetro y alertas Andon

- El horómetro acepta formato `XXXX.N` donde el último dígito representa fracción de hora
  (`3421.6` → 3421h 36min).
- **Alertas Andon** (`app.js`, `verificarAlertasAndon`): se dispara advertencia si una carga
  excede la capacidad del tanque, o si excede el consumo estimado según horas trabajadas ×
  consumo promedio, con un margen de tolerancia (`ANDON_TOLERANCIA = 1.10`, es decir 10%).
  Si el usuario confirma de todos modos, el PDF de esa carga incluye una leyenda de
  inconsistencia.

---

## 📄 PDF de conciliación de Proveedor — acomodo de tickets

`descargarProveedorPDF()` reparte las fotos de los tickets del día usando `agruparTicketsPorPagina()`:
prioriza páginas de 3 (apiladas verticalmente), usa 2 cuando hace falta (lado a lado) y evita
dejar una página con un solo ticket salvo que sea inevitable (cuando el total es 1). Cada foto
usa ajuste tipo "contain" centrado en ambos ejes dentro de su caja, para no dejar espacio en
blanco cuando la foto no es del mismo aspecto que la casilla.

| # tickets | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Páginas | [1] | [2] | [3] | [2,2] | [3,2] | [3,3] | [3,2,2] | [3,3,2] | [3,3,3] | [3,3,2,2] |

---

## ☁️ Despliegue de Cloud Functions

La única función activa hoy es `resetUserPassword` (permite al Master resetear la contraseña
de cualquier usuario sin cerrar su propia sesión; valida en el servidor que quien llama sea
Master activo). La función `consolidarPDFsECO` que existía antes fue retirada deliberadamente
(nunca funcionó de verdad y no era el enfoque que se quería) — si aún aparece desplegada en
Firebase, el siguiente `firebase deploy --only functions` la elimina sola.

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

El Service Worker (`fuelcontrol-v8`) cachea cada recurso estático por separado (no con
`cache.addAll()` en bloque), para que si un solo recurso falla al cachear no tumbe el modo
offline completo.

---

## 📊 Estructura de Firestore (colecciones reales)

- **`whitelist`** — usuarios: `email`, `rol`, `activo`, `validado`
- **`registros`** — cargas de combustible: `eco`, `fecha`, `tipoCombustible`, `litros`,
  `horometroRaw`, `rendimiento`, `zona` (al momento de la carga), `pdfUrl`, `usuario`, etc.
- **`proveedor_cargas`** — suministro diario: `fecha`, `tipoCombustible`, `litros`, `precio`,
  `ticket`, `fotoTicket`
- **`maquinaria`** — catálogo: `tipo`, `marca`, `modelo`, `eco`, `numInterno`, `zona`, `subzona`,
  `propiedad` (Propia/Rentada), `capacidadTanque`, `consumoBajo/Medio/Alto/Promedio`,
  `documentos.{permiso|factura|dc3|tarjetaCirculacion|poliza}` (cada uno como objeto
  `{tiene, url, path, vencimiento, subidoEn, subidoPor}`), `activa`
  - subcolección `historialZonas` — append-only, registra cambios de zona/subzona (para no
    mezclar el consumo de una máquina entre zonas distintas)

---

## 🔐 Seguridad — Firestore/Storage rules

Las reglas viven fuera de este repo (se administran directamente en la consola de Firebase).
Los puntos ya reconciliados entre `roles.js` y las reglas:

- `registros`: lectura abierta a todos los roles activos (Visor incluido, para que Resumen/
  Gráficos puedan calcular rendimientos); `delete` exclusivo de Master; `update` con Master
  sin restricción de `conciliado` y el resto solo si `conciliado === false`.
- `maquinaria/{eco}/documentos/*` (Storage): `write` exclusivo Admin/Master (Coordinador ya no
  sube), `read` para Master/Admin/Coordinador, `delete` para Admin/Master.

> ⚠️ Pendiente de decisión (no bloqueante): el campo `documentos` vive dentro del propio
> documento de `maquinaria`, así que la regla de Firestore que controla su escritura es la
> misma que la del resto de la ficha (`create, update` para Coordinador/Admin/Master). Eso
> significa que, a nivel de reglas, Coordinador técnicamente podría escribir ese campo aunque
> la UI ya no le muestre el botón. Si se quiere cerrar esto también a nivel de backend, hace
> falta separar el campo con `affectedKeys()` o mover documentos a su propia colección.

---

## ✅ Estado de los requerimientos originales

Los 9 puntos de `Instrucciones.txt` y los 5 de `bugs.txt` están implementados y verificados en
código a la fecha de este documento:

- Roles y jerarquía (Master/Admin/Coordinador/Residente/Visor) con matriz única en `roles.js`.
- Cargas, Pendientes, Historial con conciliación — **incluye edición de Master aún conciliado**.
- Proveedor con conciliación por tipo de combustible (semáforo verde/rojo según diferencia).
- Maquinaria con documentos, vencimientos (contador dinámico de días + semáforo 30 días) y
  control de zonas/subzonas con historial append-only.
- Pestaña Permisos.
- Resumen + Dashboard con Andon, KPIs clicables por nivel de consumo.
- PDF ejecutivo de Resumen y PDF de conciliación de Proveedor con acomodo dinámico de tickets.
- Revisión de código muerto: sin funciones fantasma pendientes en `app.js`/`roles.js` a la
  fecha de este documento.

## 🔴 Pendiente

- Pruebas de campo con operadores reales.
- Confirmar que las reglas de Firestore/Storage ya corregidas estén **publicadas** en la
  consola de Firebase (el archivo de reglas no vive en este repo, hay que subirlo aparte).
- Decidir si se cierra a nivel de reglas la nota de seguridad del campo `documentos` de
  Maquinaria mencionada arriba.

---

## 📞 Soporte

