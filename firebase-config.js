// firebase-config.js — FuelControl PWA
// Plan Gratuito (Spark): Auth + Firestore + Hosting

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCeIsd_BrHKbAY1HrYb3HL4vG4cpadUTuU",
  authDomain:        "cargas-7bf25.firebaseapp.com",
  projectId:         "cargas-7bf25",
  storageBucket:     "cargas-7bf25.firebasestorage.app",
  messagingSenderId: "1058286419136",
  appId:             "1:1058286419136:web:14246dae0c214429fe0125"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

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

console.log("✅ Firebase inicializado — cargas-7bf25");
