
// ==========================================
// GABOIL - CONFIGURATION FIREBASE
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuration officielle du projet
const firebaseConfig = {
    apiKey: "AIzaSyCDGTUqgYFU_MvErFWpE71fflMkJxBc-sI",
    authDomain: "gaboil.firebaseapp.com",
    projectId: "gaboil",
    storageBucket: "gaboil.firebasestorage.app",
    messagingSenderId: "985729123372",
    appId: "1:985729123372:web:24db8dfcf0346bc758bd89"
};

// Initialisation de Firebase
const app = initializeApp(firebaseConfig);

// Initialisation des services
const auth = getAuth(app);
const db = getFirestore(app);

// Exportation pour les autres pages
export { app, auth, db };
