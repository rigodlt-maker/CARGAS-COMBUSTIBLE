// functions/index.js — Firebase Cloud Functions
// FuelControl: Consolidación automática de PDFs por ECO/día
// Deploy: firebase deploy --only functions

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp }     = require("firebase-admin/app");
const { getFirestore }      = require("firebase-admin/firestore");
const { getStorage }        = require("firebase-admin/storage");
const { PDFDocument }       = require("pdf-lib");

initializeApp();

// =============================================
// Cloud Function: Consolidar PDFs por ECO + Día
// Se dispara cada vez que se crea un registro nuevo
// =============================================
exports.consolidarPDFsECO = onDocumentCreated(
  "registros/{docId}",
  async (event) => {
    const snap    = event.data;
    const data    = snap.data();
    const { fecha, eco } = data;

    const db      = getFirestore();
    const bucket  = getStorage().bucket();

    try {
      console.log(`🔄 Consolidando PDFs para ECO: ${eco}, Fecha: ${fecha}`);

      // 1. Obtener todos los registros del mismo ECO y fecha
      const q = await db.collection("registros")
        .where("fecha", "==", fecha)
        .where("eco",   "==", eco)
        .get();

      if (q.empty) { console.log("Sin registros."); return; }

      const registros = q.docs.map(d => d.data()).filter(d => d.pdfPath);
      if (registros.length < 1) { console.log("Sin PDFs para consolidar."); return; }

      // 2. Descargar todos los PDFs individuales
      const pdfBuffers = await Promise.all(
        registros.map(async (r) => {
          const [buffer] = await bucket.file(r.pdfPath).download();
          return buffer;
        })
      );

      // 3. Fusionar con pdf-lib
      const merged = await PDFDocument.create();
      for (const buf of pdfBuffers) {
        const srcDoc = await PDFDocument.load(buf);
        const pages  = await merged.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }

      const mergedBytes = await merged.save();

      // 4. Subir PDF consolidado
      const consolidatedPath = `${fecha}/${eco}/CONSOLIDADO_${eco}_${fecha}.pdf`;
      await bucket.file(consolidatedPath).save(Buffer.from(mergedBytes), {
        metadata: { contentType: "application/pdf" },
      });

      // 5. Obtener URL pública
      const [url] = await bucket.file(consolidatedPath).getSignedUrl({
        action:  "read",
        expires: "03-01-2500",
      });

      // 6. Actualizar el campo consolidatedPdfUrl en todos los registros del grupo
      const batch = db.batch();
      q.docs.forEach(d => {
        batch.update(d.ref, { consolidatedPdfUrl: url, consolidatedPdfPath: consolidatedPath });
      });
      await batch.commit();

      console.log(`✅ PDF consolidado: ${consolidatedPath} (${registros.length} tickets)`);
    } catch (err) {
      console.error("❌ Error consolidando PDFs:", err);
    }
  }
);

// =============================================
// INSTRUCCIONES DE CONFIGURACIÓN
// =============================================
/*
1. Instalar dependencias:
   cd functions && npm install pdf-lib firebase-admin firebase-functions

2. Inicializar Firebase Functions:
   firebase init functions

3. Deploy:
   firebase deploy --only functions

4. Agregar correos a la whitelist en Firestore:
   Colección: "whitelist"
   Documento por correo: { email: "operador@ejemplo.com", nombre: "Juan Pérez", activo: true }

5. Roles de usuario (whitelist):
   Cada documento de "whitelist" ahora soporta:
   { email: "...", nombre: "...", rol: "capturista" | "admin" | "master", activo: true }
   - capturista: crea registros y sube el ticket de los que dejó "pendientes".
   - admin: además puede editar registros no conciliados (corregir errores).
   - master: además puede "conciliar" (bloquear) registros y gestionar usuarios
             desde la pestaña "Usuarios" de la app.
   IMPORTANTE: el ID de cada documento debe ser el correo en minúsculas (igual
   que ya lo exigían las reglas de abajo). El panel "Usuarios" de la app ya
   crea los documentos nuevos así automáticamente.

6. Reglas de Firestore (firestore.rules):

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function whitelistDoc() {
      return get(/databases/$(database)/documents/whitelist/$(request.auth.token.email));
    }
    function isWhitelisted() {
      return request.auth != null && exists(/databases/$(database)/documents/whitelist/$(request.auth.token.email));
    }
    function rolActual() {
      return whitelistDoc().data.rol;
    }
    function estaActivo() {
      return whitelistDoc().data.activo != false;
    }

    match /registros/{docId} {
      allow read:   if isWhitelisted() && estaActivo();
      allow create: if isWhitelisted() && estaActivo();

      // Un registro "conciliado" ya no se puede tocar, sin excepción.
      // Capturistas solo pueden actualizar SUS registros pendientes (subir ticket).
      // Admin General / Admin Maestro pueden editar cualquier registro no conciliado.
      allow update: if isWhitelisted() && estaActivo() &&
        resource.data.conciliado != true &&
        (
          rolActual() in ['admin', 'master'] ||
          (rolActual() == 'capturista' && resource.data.status == 'pendiente')
        );

      allow delete: if false;
    }

    // Whitelist: lectura para cualquier usuario autenticado,
    // pero solo el Admin Maestro puede crear/editar usuarios y roles.
    match /whitelist/{email} {
      allow read: if request.auth != null;
      allow write: if isWhitelisted() && rolActual() == 'master';
    }
  }
}

7. Reglas de Storage (storage.rules):

rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{fecha}/{eco}/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
*/
