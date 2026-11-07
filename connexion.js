// ==========================================================================
// GABOIL — Logique de Connexion & Routage Sécurisé (SDK v10.8.0) + Diagnostic
// ==========================================================================

import { auth, db } from './firebase.js';
import { 
    signInWithEmailAndPassword, 
    signOut, 
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Récupération des éléments du DOM
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const rememberMeCheckbox = document.getElementById('rememberMe');
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const alertBox = document.getElementById('alertBox');

// Fonction utilitaire pour afficher les notifications dans l'interface
function showAlert(message, type = 'error') {
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.style.display = 'block';
    if (type === 'success') {
        alertBox.className = 'alert-box alert-success';
    } else {
        alertBox.className = 'alert-box alert-error';
    }
}

function hideAlert() {
    if (!alertBox) return;
    alertBox.style.display = 'none';
    alertBox.textContent = '';
}

// 1. Gestion de l'affichage / masquage du mot de passe
if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
        const currentType = passwordInput.getAttribute('type');
        if (currentType === 'password') {
            passwordInput.setAttribute('type', 'text');
            togglePasswordBtn.classList.add('show-password');
        } else {
            passwordInput.setAttribute('type', 'password');
            togglePasswordBtn.classList.remove('show-password');
        }
    });
}

// 2. Gestion de la soumission du formulaire de connexion
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideAlert();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email) {
            showAlert("Veuillez saisir votre adresse e-mail.");
            emailInput.focus();
            return;
        }
        if (!password) {
            showAlert("Veuillez saisir votre mot de passe.");
            passwordInput.focus();
            return;
        }

        setLoadingState(true, "Connexion en cours...");

        try {
            // Configuration de la persistance de session
            const persistenceMode = rememberMeCheckbox && rememberMeCheckbox.checked 
                ? browserLocalPersistence 
                : browserSessionPersistence;
            
            await setPersistence(auth, persistenceMode);

            // Étape 1 : Authentification Firebase Auth
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            showAlert("Connexion réussie. Vérification du profil...", "success");

            // Étape 2 : Récupération stricte du profil Firestore (users/{uid})
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);

            // Étape 3 : Vérification de l'existence du profil
            if (!userDocSnap.exists()) {
                await signOut(auth);
                setLoadingState(false);
                showAlert("Accès refusé : Aucun profil utilisateur n'est associé à ce compte dans la base de données.");
                return;
            }

            const userData = userDocSnap.data();

            // --- JOURNAUX DE DIAGNOSTIC TEMPORAIRES DEMANDÉS ---
            console.log("UID connecté :", user.uid);
            console.log("Profil Firestore :", userData);
            console.log("Rôle récupéré :", userData.role);
            console.log("Statut actif :", userData.actif);
            // ----------------------------------------------------

            // Étape 4 : Vérification du statut actif (actif === true)
            if (userData.actif !== true) {
                await signOut(auth);
                setLoadingState(false);
                showAlert("Accès refusé : Votre compte a été désactivé par l'administrateur.");
                return;
            }

            // Étape 5 : Normalisation et vérification du rôle (ADMIN ou CAISSIERE)
            const role = userData.role ? String(userData.role).trim().toUpperCase() : "";

            if (role === "ADMIN") {
                setTimeout(() => { window.location.href = "admin.html"; }, 500);
            } else if (role === "CAISSIERE") {
                setTimeout(() => { window.location.href = "accueil.html"; }, 500);
            } else {
                // Rôle inconnu ou absent
                await signOut(auth);
                setLoadingState(false);
                console.error("Rôle Firestore invalide ou non reconnu pour l'UID :", user.uid, "Rôle trouvé :", userData.role);
                showAlert("Accès refusé : Rôle utilisateur non reconnu (" + (userData.role || "Aucun") + ").");
            }

        } catch (error) {
            setLoadingState(false);
            handleAuthError(error);
        }
    });
}

// 3. Gestion du lien "Mot de passe oublié ?"
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
        e.preventDefault();
        hideAlert();

        const email = emailInput.value.trim();
        if (!email) {
            showAlert("Veuillez saisir votre adresse e-mail dans le champ ci-dessus avant de demander la réinitialisation.");
            emailInput.focus();
            return;
        }

        try {
            await sendPasswordResetEmail(auth, email);
            showAlert("Un e-mail de réinitialisation de mot de passe a été envoyé à l'adresse " + email + ".", "success");
        } catch (error) {
            handleAuthError(error);
        }
    });
}

// 4. Gestion de l'état de chargement du bouton
function setLoadingState(isLoading, message = "Se connecter") {
    if (!loginBtn) return;
    if (isLoading) {
        loginBtn.disabled = true;
        loginBtn.textContent = message;
        loginBtn.style.opacity = "0.7";
        loginBtn.style.cursor = "not-allowed";
    } else {
        loginBtn.disabled = false;
        loginBtn.textContent = "Se connecter";
        loginBtn.style.opacity = "1";
        loginBtn.style.cursor = "pointer";
    }
}

// 5. Gestion centralisée des erreurs
function handleAuthError(error) {
    console.error("Erreur Firebase Authentication / Firestore :", error.code, error.message);

    switch (error.code) {
        case 'auth/invalid-email':
            showAlert("Adresse e-mail invalide. Vérifiez le format saisi.");
            break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            showAlert("Adresse e-mail ou mot de passe incorrect.");
            break;
        case 'auth/too-many-requests':
            showAlert("Trop de tentatives infructueuses. Veuillez réessayer plus tard.");
            break;
        case 'auth/network-request-failed':
            showAlert("Connexion Internet impossible. Vérifiez votre réseau.");
            break;
        default:
            showAlert("Erreur de connexion : " + (error.message || "Impossible de traiter la demande."));
            break;
    }
}