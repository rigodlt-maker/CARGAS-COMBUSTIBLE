// =============================================
// firebase-config.js — Plan Gratuito (Spark)
// Sin Storage ni Cloud Functions
// Solo: Authentication + Firestore + Hosting
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ⚠️  PASO OBLIGATORIO:
// 1. Ve a console.firebase.google.com
// 2. Tu proyecto → Configuración (engranaje) → Tus apps → Agregar app Web (</>)
// 3. Copia el objeto firebaseConfig y pégalo aquí reemplazando los valores de abajo

const firebaseConfig = {
  apiKey:            "TU_API_KEY",
  authDomain:        "TU_PROYECTO.firebaseapp.com",
  projectId:         "TU_PROYECTO",
  storageBucket:     "TU_PROYECTO.appspot.com",   // se puede dejar aunque no uses Storage
  messagingSenderId: "TU_SENDER_ID",
  appId:             "TU_APP_ID"
};

// Inicializar Firebase
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Exponer funciones globalmente para app.js
window.firebaseAuth    = auth;
window.firebaseDB      = db;

window.fbSignIn        = signInWithEmailAndPassword;
window.fbSignOut       = signOut;
window.fbAuthChanged   = onAuthStateChanged;

window.fbCollection    = collection;
window.fbAddDoc        = addDoc;
window.fbGetDocs       = getDocs;
window.fbQuery         = query;
window.fbWhere         = where;
window.fbOrderBy       = orderBy;
window.fbTimestamp     = Timestamp;

console.log("✅ Firebase inicializado (Auth + Firestore)");
window.fbAddDoc        = addDoc;
window.fbGetDocs       = getDocs;
window.fbQuery         = query;
window.fbWhere         = where;
window.fbOrderBy       = orderBy;
window.fbTimestamp     = Timestamp;
window.fbStorageRef    = ref;
window.fbUploadBytes   = uploadBytes;
window.fbGetDownloadURL = getDownloadURL;

console.log("✅ Firebase inicializado");
