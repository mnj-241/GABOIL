// ==========================================================================
// GABOIL — Logique Métier de l'Espace Accueil / Tableau de Bord
// ==========================================================================

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUserProfile = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "connexion.html"; return; }
    
    try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (!userSnap.exists() || !userSnap.data().actif) { 
            window.location.href = "connexion.html"; 
            return; 
        }

        currentUserProfile = {
            uid: user.uid,
            ...userSnap.data()
        };

        const userName = currentUserProfile.nom || "Utilisateur";
        
        const welcomeNameEl = document.getElementById('welcomeName');
        if (welcomeNameEl) welcomeNameEl.textContent = userName;

        const sidebarUserNameEl = document.getElementById('sidebarUserName');
        if (sidebarUserNameEl) sidebarUserNameEl.textContent = userName;

        loadDashboardMetrics();
    } catch (e) {
        console.error("Erreur d'authentification accueil :", e);
        window.location.href = "connexion.html";
    }
});

async function loadDashboardMetrics() {
    try {
        // --- 1. STOCK COMMUN (Visible par tous : Admin et Caissières) ---
        const productsSnap = await getDocs(collection(db, "products"));
        let activeCount = 0;
        let lowStockHTML = "";

        productsSnap.forEach(d => {
            const p = d.data();
            if (p.actif !== false) activeCount++;
            if (p.stock <= 5) {
                lowStockHTML += `<div style="padding:0.5rem 0; border-bottom:1px solid #2a2a30; display:flex; justify-content:space-between;">
                    <span>${escapeHtml(p.nom)}</span><strong style="color:#ffa726;">Stock : ${p.stock}</strong>
                </div>`;
            }
        });

        const activeProdEl = document.getElementById('activeProductsCount');
        if (activeProdEl) activeProdEl.textContent = activeCount;

        const lowStockEl = document.getElementById('lowStockAlerts');
        if (lowStockEl) lowStockEl.innerHTML = lowStockHTML || `<p class="empty-text">Aucun produit en stock critique.</p>`;

        // --- 2. VENTES DU JOUR (Filtrées par rôle et par UID pour les caissières) ---
        const salesSnap = await getDocs(collection(db, "sales"));
        let totalRevenue = 0;
        let todayCount = 0;
        
        // Date courante au format local (Libreville) pour la comparaison journalière
        const nowLibreville = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Libreville" }));
        const todayStr = formatDateKey(nowLibreville);

        salesSnap.forEach(d => {
            const s = d.data();
            
            // Si c'est une caissière, on ignore les ventes qui ne lui appartiennent pas
            if (currentUserProfile.role !== "ADMIN" && s.caissiereId !== currentUserProfile.uid) {
                return;
            }

            if (s.date && !s.corrige) {
                const saleDateObj = s.date.toDate();
                const localSaleDate = new Date(saleDateObj.toLocaleString("en-US", { timeZone: "Africa/Libreville" }));
                const saleDateStr = formatDateKey(localSaleDate);

                if (saleDateStr === todayStr) {
                    totalRevenue += (s.montantTotal || 0);
                    todayCount++;
                }
            }
        });

        const revEl = document.getElementById('todayRevenue');
        if (revEl) revEl.textContent = totalRevenue.toLocaleString('fr-FR') + " FCFA";

        const countEl = document.getElementById('todaySalesCount');
        if (countEl) countEl.textContent = todayCount;

    } catch (e) { 
        console.error("Erreur chargement accueil:", e); 
    }
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t]||t));
}