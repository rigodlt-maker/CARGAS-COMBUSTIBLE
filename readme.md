# FuelControl PWA — Guía de Implementación
## Rompeolas Oriente · ASPN-GI-CO-62601-016-25

---

## 📁 Estructura de archivos (real, tal como está en este repo)

```
CARGAS-COMBUSTIBLE-main/
├── index.html      ← App principal (PWA shell)
├── style.css       ← Estilos (paleta oscura industrial)
├── app.js          ← Lógica de formulario, cámara, Firestore Y CONFIG DE FIREBASE
├── index.js        ← Cloud Function (consolidación de PDFs) — pertenece a functions/index.js
├── manifest.json   ← PWA manifest
├── service-worker.js ← Cache offline
├── icon-192.png / icon-512.png
└── readme.md
```

> ⚠️ NOTA: a diferencia de versiones anteriores de esta guía, **no existe
> un archivo `firebase-config.js` separado**. La configuración de Firebase
> (`apiKey`, `projectId`, etc.) está embebida directamente dentro de
> `app.js`, en la función `loadFirebase()`. Si vas a desplegar este
> proyecto en OTRO proyecto de Firebase (no el actual), edita esos
> valores directamente ahí.
>
> También, `index.js` en este repo NO va en la raíz del hosting — es el
> código de la Cloud Function y debe colocarse dentro de una carpeta
> `functions/` al hacer `firebase init functions` (ver Paso 5).

---

## 🔧 Paso 1: Crear proyecto Firebase

1. Ir a [console.firebase.google.com](https://console.firebase.google.com)
2. Crear proyecto: `fuelcontrol-rompeolas`
3. Habilitar servicios:
   - **Authentication** → Email/Contraseña
   - **Firestore** → Modo producción
   - **Storage** → Modo producción
   - **Functions** → Plan Blaze (necesario para Cloud Functions)

---

## 🔑 Paso 2: Configurar la conexión a Firebase

Editar directamente el objeto `firebaseConfig` dentro de **`app.js`**
(función `loadFirebase()`, cerca de la línea 151):

```js
const firebaseConfig = {
  apiKey:            "AIza...",
  authDomain:        "fuelcontrol-rompeolas.firebaseapp.com",
  projectId:         "fuelcontrol-rompeolas",
  storageBucket:     "fuelcontrol-rompeolas.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...:web:abc..."
};
```

> 🔒 Nota de seguridad: estas credenciales de Firebase son públicas por
> diseño (cualquier app web las expone en el navegador). Lo que
> realmente protege tus datos son las **reglas de seguridad de
> Firestore/Storage** (ver Paso 4) y la whitelist de usuarios — no el
> ocultar este objeto.

---

## 👥 Paso 3: Whitelist de usuarios

En **Firestore Console**, crear colección `whitelist`:

| Documento ID       | Campo  | Valor                   |
|--------------------|--------|-------------------------|
| operador1@obra.com | email  | operador1@obra.com      |
|                    | nombre | Juan Pérez              |
|                    | activo | true                    |

Para crear usuario → **Authentication** → **Agregar usuario** → email + contraseña.

---

## 🛡 Paso 4: Reglas de seguridad

### Firestore (`firestore.rules`):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /registros/{docId} {
      allow read, write: if request.auth != null &&
        exists(/databases/$(database)/documents/whitelist/$(request.auth.token.email));
    }
    match /whitelist/{email} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

### Storage (`storage.rules`):
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{fecha}/{eco}/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## ☁️ Paso 5: Deploy Cloud Functions (consolidación PDFs)

```bash
# Instalar Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Inicializar (en la carpeta del proyecto)
firebase init functions
# Elegir: JavaScript, No ESLint
# Esto crea una carpeta functions/ con su propio index.js de plantilla.

# IMPORTANTE: reemplaza ese functions/index.js de plantilla por el
# index.js que viene en este repo (es el código real de la Cloud Function).

# Instalar dependencias
cd functions
npm install pdf-lib firebase-admin firebase-functions

# Deploy
cd ..
firebase deploy --only functions
```

---

## 🌐 Paso 6: Hosting (recomendado)

```bash
firebase init hosting
# Public directory: . (raíz)
# Configure as SPA: No
# Overwrite index.html: No

firebase deploy --only hosting
```

URL resultante: `https://fuelcontrol-rompeolas.web.app`

---

## 📱 Instalar como PWA en dispositivo

1. Abrir la URL en **Chrome** (Android) o **Safari** (iOS)
2. Android: Menú → "Agregar a pantalla de inicio"
3. iOS: Compartir → "Agregar a pantalla de inicio"

---

## 🗂 Estructura de datos en Storage

```
Storage/
└── YYYY-MM-DD/
    └── ECO-042/
        ├── ticket_TK-00847_1718123456.pdf   ← PDF individual
        ├── ticket_TK-00848_1718124000.pdf
        └── CONSOLIDADO_ECO-042_2025-01-15.pdf  ← Auto-generado por Cloud Function
```

---

## 📊 Estructura de Firestore

### Colección: `registros`
```json
{
  "fecha":          "2025-01-15",
  "eco":            "ECO-042",
  "maquinaria":     "Excavadora CAT 336",
  "ticket":         "TK-00847",
  "tipo":           "Diésel",
  "litros":         350.5,
  "cuentaInicial":  0,
  "cuentaFinal":    350.5,
  "horometro":      "3421.6",
  "sinHorometro":   false,
  "pdfUrl":         "https://storage.googleapis.com/...",
  "pdfPath":        "2025-01-15/ECO-042/ticket_TK-00847_...",
  "consolidatedPdfUrl": "https://...",
  "usuario":        "operador@obra.com",
  "creadoEn":       "Timestamp"
}
```

---

## ⚡ Lógica del horómetro

El campo acepta formato `XXXX.N` donde el último dígito representa fracción de hora:
- `3421.6` → 3421 horas + (6 × 6 min) = 3421h 36min
- El badge muestra la conversión en tiempo real

---

## 🔄 Flujo de consolidación PDF

1. Operador llena formulario → guarda registro + PDF individual en Storage
2. Cloud Function `consolidarPDFsECO` se dispara automáticamente
3. Busca todos los tickets del mismo ECO + fecha
4. Fusiona PDFs con `pdf-lib`
5. Sube `CONSOLIDADO_ECO_FECHA.pdf` a la carpeta del ECO
6. Actualiza todos los registros con URL del consolidado

---

## 📞 Soporte

Proyecto: Rompeolas Oriente — ASPN-GI-CO-62601-016-25  
Módulo: Control de Combustibles y Rendimientos
