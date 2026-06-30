# FuelControl PWA — Control de Combustible y Maquinaria
## Rompeolas Oriente · ASPN-GI-CO-62601-016-25

> Este documento reemplaza al `readme.md` anterior (describía una versión
> sin roles ni maquinaria, ya obsoleta). Refleja el estado real del
> repositorio al **30-jun-2026**.

---

## 📁 Estructura de archivos

```
CARGAS-COMBUSTIBLE-main/
├── index.html        ← Shell de la PWA, todas las pantallas/tabs
├── app.js             ← Núcleo: Firebase config, Maquinaria, Permisos,
│                         Andon, Resumen, Dashboard, PDFs (jsPDF)
├── auth.js            ← Login / logout / sesión
├── cargas.js           ← Flujo de captura "Cargas" (4 pasos)
├── historial.js        ← Historial, conciliación, edición
├── nav.js              ← Navegación entre tabs / modales (back button)
├── offline.js          ← Cola de sincronización sin internet
├── pdf.js               ← Helpers de generación de PDF (jsPDF)
├── roles.js             ← ÚNICA fuente de verdad de permisos por rol
├── state.js              ← Estado global de la app (usuario, rol, cache)
├── service-worker.js      ← Cache offline (PWA)
├── manifest.json           ← PWA manifest
├── icon-192.png / icon-512.png
└── readme.md

Fuera del repo (los manejas en Firebase Console / CLI):
├── firestore.rules        ← Reglas de Firestore (ver firestore_rules.txt)
└── storage.rules            ← Reglas de Storage (ver firebase_storage.txt)
```

> ⚠️ La configuración de Firebase (`apiKey`, `projectId`, etc.) sigue
> embebida en `app.js`. Las Cloud Functions van en `functions/index.js`
> (el `index.js` de la raíz del repo es ese código, pero debe copiarse
> dentro de la carpeta `functions/` al hacer `firebase init functions`).

---

## ✅ Estado de funcionalidades (vs. requerimientos originales)

| # | Funcionalidad | Estado |
|---|---|---|
| 1 | Rol **Master**: control total, edita historial conciliado, panel de Usuarios, reset de contraseña server-side | ✅ Hecho |
| 2 | Rol **Admin**: historial sin editar conciliado, crea usuarios (quedan pendientes de validar por Master), no asigna rango mayor al suyo | ✅ Hecho |
| 2.1 | Contraseña asignable al crear usuario | ✅ Hecho |
| 2.2 | Pestaña "Registro" → renombrada **"Cargas"** | ✅ Hecho |
| 3 | Rol **Residente**: solo Cargas, Pendientes, Proveedor (oculto por flag), Maquinaria | ✅ Hecho |
| 4 | Rol **Coordinador**: Cargas, Historial (edita y descarga PDF, no concilia), Usuarios sin ver Master ni crear/cambiar roles | ✅ Hecho |
| 4.1 | Pestaña **Proveedor** (litros, tipo de combustible, precio, foto, slicer de fecha) | ✅ Hecho |
| 5 | Rol **Visor**: solo Gráficos, Maquinaria, Resumen; descarga PDF de Resumen | ✅ Hecho |
| 5.1 | Pestaña "Exportar" eliminada → reemplazada por **Resumen** | ✅ Hecho |
| 6 | **Resumen**: sección Rendimientos (slicers fecha/zona, gráfico por zona o por máquina) + sección Equipos (conteo por tipo, Propia/Rentada) | ✅ Hecho |
| 7 | Panel **Maquinaria**: filtros (eco, banco, proveedor, activa/inactiva), descarga de consumos por máquina en Excel, alta/edición restringida a Coordinador/Admin/Master | ✅ Hecho |
| 7.1 | Alta de maquinaria con catálogo (tipo/marca/modelo + "Otro"), zonas/subzonas, checklist de 5 documentos | ✅ Hecho |
| 7.2 | Subida de PDFs de documentos (Permiso, Factura, DC3, Tarjeta de circulación, Póliza) + pestaña **Permisos** con leyenda "Sin permiso" | ✅ Hecho (estaba marcado como pendiente en la nota anterior — ya está implementado) |
| 7 (zonas) | Historial de zonas append-only, consumo no se traslada entre zonas | ✅ Hecho |
| 8 | Dashboard con KPIs (Bajo/Medio/Alto), slicers, gráficos por zona/subzona, tabla tipo/cantidad/marcas/consumo promedio | ✅ Hecho |
| 9 | Alertas **Andon**: capacidad de tanque y consumo estimado por horómetro, con leyenda impresa en el PDF de la carga | ✅ Hecho |

**Conclusión:** el repositorio que subiste hoy ya cubre los 9 puntos de tu
brief original. No se encontraron bugs activos, TODOs ni código muerto
en la revisión de `app.js`, `roles.js`, `cargas.js`, `historial.js`,
`index.js` (Cloud Functions) ni en las reglas de Firestore/Storage.

---

## 🔴 Pendiente / a decidir contigo

Nada bloqueante. Posibles siguientes pasos, según prioricemos:

1. **Confirmar despliegue real**: ¿ya hiciste `firebase deploy --only functions`
   con el `resetUserPassword` nuevo? Si la función vieja `consolidarPDFsECO`
   seguía desplegada, este deploy la elimina sola.
2. **`RESIDENTE_VE_PROVEEDOR`** está en `false` en `roles.js` (línea ~24):
   el código ya soporta activarlo, solo falta tu decisión de negocio.
3. Revisar si quieres ajustar el `ANDON_TOLERANCIA` (actualmente 15% de
   margen antes de disparar la alerta de sobreconsumo estimado).
4. Pulido de UX / pruebas de campo (esto ya no es código, es validación
   con los operadores reales).

---

## 🔧 Resumen rápido de configuración (Firebase)

1. **Authentication** → Email/Contraseña habilitado.
2. **Firestore** → colecciones `whitelist`, `registros`, `proveedor_cargas`,
   `maquinaria` (con subcolecciones `historialZonas` y `documentos`),
   `catalogos`. Reglas: ver `firestore_rules.txt` (control por rol vía
   colección `whitelist`, jerarquía Master > Admin > Coordinador >
   Residente > Visor).
3. **Storage** → rutas `registros/{fecha}/{eco}/{archivo}.jpg`,
   `proveedor/{fecha}/{archivo}.jpg`, `maquinaria/{eco}/documentos/{archivo}.pdf`.
   Reglas: ver `firebase_storage.txt` (usa `firestore.get()` cross-service
   para validar rol/activo contra la whitelist).
4. **Functions** (Plan Blaze) → `resetUserPassword` callable, valida en
   servidor que quien llama sea Master activo antes de tocar otra cuenta.
5. **Hosting** (opcional) → `firebase deploy --only hosting`.

---

## 📞 Soporte

Proyecto: Rompeolas Oriente — ASPN-GI-CO-62601-016-25
Módulo: Control de Combustibles, Maquinaria y Rendimientos
