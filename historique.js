// ==========================================================================
// GABOIL — Logique Métier de l'Espace Historique
// ==========================================================================

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, doc, onSnapshot, getDoc, getDocs, runTransaction, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let allSales = [];
let usersPreferences = {}; 
let selectedSaleId = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "connexion.html"; return; }
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists() || !userSnap.data().actif) { window.location.href = "connexion.html"; return; }

    currentUser = { 
        uid: user.uid, 
        nom: userSnap.data().nom || "Utilisateur", 
        role: userSnap.data().role 
    };
    const userNameEl = document.getElementById('sidebarUserName');
    if (userNameEl) userNameEl.textContent = currentUser.nom;

    await loadUsersPreferences();
    initHistoriqueApp();
});

async function loadUsersPreferences() {
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        usersSnap.forEach(d => {
            usersPreferences[d.id] = d.data();
        });
    } catch (e) {
        console.error("Erreur chargement préférences utilisateurs:", e);
    }
}

function initHistoriqueApp() {
    const searchSale = document.getElementById('searchSale');
    const correctModal = document.getElementById('correctModal');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalConfirmBtn = document.getElementById('modalConfirmBtn');

    const q = query(collection(db, "sales"), orderBy("date", "desc"));
    onSnapshot(q, (snapshot) => {
        allSales = [];
        snapshot.forEach(d => allSales.push({ id: d.id, ...d.data() }));
        filterAndRenderSales();
    });

    if (searchSale) {
        searchSale.addEventListener('input', filterAndRenderSales);
    }

    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', () => { correctModal.style.display = 'none'; });
    }

    if (modalConfirmBtn) {
        modalConfirmBtn.addEventListener('click', async () => {
            const motif = document.getElementById('correctionMotif').value.trim();
            if (!motif) { alert("Veuillez saisir un motif."); return; }
            correctModal.style.display = 'none';
            await executeCorrection(selectedSaleId, motif);
        });
    }
}

function filterAndRenderSales() {
    const searchVal = document.getElementById('searchSale') ? document.getElementById('searchSale').value.toLowerCase() : "";
    
    const filteredList = allSales.filter(sale => {
        if (currentUser.role !== "ADMIN") {
            if (sale.caissiereId === currentUser.uid) {
                // Autorisés (ses propres ventes)
            } else {
                const ownerPrefs = usersPreferences[sale.caissiereId];
                if (!ownerPrefs || ownerPrefs.partagerHistorique !== true) {
                    return false; 
                }
            }
        }

        if (searchVal) {
            const matchProd = sale.nomProduit && sale.nomProduit.toLowerCase().includes(searchVal);
            const matchCaissiere = sale.caissiereNom && sale.caissiereNom.toLowerCase().includes(searchVal);
            if (!matchProd && !matchCaissiere) return false;
        }

        return true;
    });

    renderSalesGroupedByDay(filteredList);
}

// ==========================================================================
// Regroupement et Affichage par Journée (Fuseau: Africa/Libreville)
// ==========================================================================
function renderSalesGroupedByDay(list) {
    const tbody = document.getElementById('salesTableBody');
    if (!tbody) return;
    tbody.innerHTML = "";

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--color-gray); padding: 2rem;">Aucune vente visible dans l'historique.</td></tr>`;
        return;
    }

    // 1. Obtenir la date d'aujourd'hui et d'hier à Libreville au format YYYY-MM-DD
    const nowLibreville = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Libreville" }));
    const todayStr = formatDateKey(nowLibreville);
    
    const yesterdayDate = new Date(nowLibreville);
    yesterdayDate.setDate(nowLibreville.getDate() - 1);
    const yesterdayStr = formatDateKey(yesterdayDate);

    // 2. Regrouper les ventes par clé de date locale
    const groups = {};
    list.forEach(sale => {
        const saleDateObj = sale.date ? (sale.date.toDate ? sale.date.toDate() : new Date(sale.date)) : new Date();
        const localDateObj = new Date(saleDateObj.toLocaleString("en-US", { timeZone: "Africa/Libreville" }));
        const dateKey = formatDateKey(localDateObj);

        if (!groups[dateKey]) {
            groups[dateKey] = {
                dateObj: localDateObj,
                sales: []
            };
        }
        groups[dateKey].sales.push({ ...sale, parsedDate: localDateObj, originalDateObj: saleDateObj });
    });

    // 3. Trier les journées de la plus récente à la plus ancienne
    const sortedDateKeys = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

    // 4. Générer l'affichage pour chaque groupe de journée
    sortedDateKeys.forEach((dateKey, index) => {
        const group = groups[dateKey];
        // Trier les ventes à l'intérieur de la journée de la plus récente à la plus ancienne
        group.sales.sort((a, b) => b.originalDateObj - a.originalDateObj);

        // Déterminer l'en-tête de la journée
        let dayHeaderLabel = "";
        const optionsLong = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        
        if (dateKey === todayStr) {
            const formattedDate = group.dateObj.toLocaleDateString('fr-FR', optionsLong);
            dayHeaderLabel = `AUJOURD'HUI — ${formattedDate}`;
        } else if (dateKey === yesterdayStr) {
            const formattedDate = group.dateObj.toLocaleDateString('fr-FR', optionsLong);
            dayHeaderLabel = `HIER — ${formattedDate}`;
        } else {
            dayHeaderLabel = group.dateObj.toLocaleDateString('fr-FR', optionsLong).toUpperCase();
        }

        const countText = `${group.sales.length} opération${group.sales.length > 1 ? 's' : ''}`;

        // Ligne d'en-tête de la journée insérée dans le tableau
        const headerTr = document.createElement('tr');
        headerTr.className = 'day-group-header-row';
        headerTr.innerHTML = `
            <td colspan="8" style="background-color: var(--color-surface-card); padding: 0.85rem 1rem; border-left: 4px solid var(--color-primary);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-family: var(--font-heading); font-size: 0.95rem; font-weight: 700; color: #fff; text-transform: uppercase;">${escapeHtml(dayHeaderLabel)}</span>
                    <span style="font-size: 0.85rem; color: var(--color-gray); background: rgba(255,255,255,0.05); padding: 0.2rem 0.6rem; border-radius: 4px;">${countText}</span>
                </div>
            </td>
        `;
        tbody.appendChild(headerTr);

        // Insérer les lignes de ventes de cette journée
        group.sales.forEach(s => {
            const timeStr = s.date ? s.date.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Libreville' }) : "00:00";
            const isOwner = s.caissiereId === currentUser.uid;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding-left: 1.5rem;">${timeStr}</td>
                <td>${escapeHtml(s.nomProduit)}</td>
                <td>${s.quantite}</td>
                <td>${Number(s.prixUnitaire).toLocaleString('fr-FR')} FCFA</td>
                <td><strong>${Number(s.montantTotal).toLocaleString('fr-FR')} FCFA</strong></td>
                <td>${escapeHtml(s.caissiereNom)}</td>
                <td><span class="${!s.corrige ? 'badge-ok' : 'badge-corrected'}">${!s.corrige ? 'Validée' : 'Corrigée'}</span></td>
                <td>
                    ${isOwner && !s.corrige ? `<button class="btn-correct" data-id="${s.id}">Corriger</button>` : `<span style="font-size:0.8rem; color: var(--color-gray);">${isOwner ? 'Tracé' : 'Lecture seule'}</span>`}
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Ajouter un séparateur discret entre les journées (sauf après la dernière)
        if (index < sortedDateKeys.length - 1) {
            const separatorTr = document.createElement('tr');
            separatorTr.innerHTML = `<td colspan="8" style="padding: 0.75rem 0; border: none;"><hr style="border: none; height: 1px; background-color: var(--color-border); margin: 0;"></td>`;
            tbody.appendChild(separatorTr);
        }
    });

    // Réattacher les écouteurs d'événements pour les boutons de correction
    document.querySelectorAll('.btn-correct').forEach(btn => {
        btn.addEventListener('click', (e) => {
            selectedSaleId = e.target.dataset.id;
            const sale = allSales.find(x => x.id === selectedSaleId);
            if (sale) {
                document.getElementById('modalSaleInfo').textContent = `Vente : ${sale.nomProduit} (${sale.quantite} unité(s)) - ${Number(sale.montantTotal).toLocaleString('fr-FR')} FCFA`;
                document.getElementById('correctionMotif').value = "";
                document.getElementById('correctModal').style.display = 'flex';
            }
        });
    });
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function executeCorrection(saleId, motif) {
    try {
        await runTransaction(db, async (transaction) => {
            const saleRef = doc(db, "sales", saleId);
            const saleDoc = await transaction.get(saleRef);
            if (!saleDoc.exists()) throw new Error("Vente introuvable.");

            const saleData = saleDoc.data();
            if (saleData.corrige) throw new Error("Cette vente a déjà été corrigée.");
            if (saleData.caissiereId !== currentUser.uid) throw new Error("Vous ne pouvez corriger que vos propres ventes.");

            const productRef = doc(db, "products", saleData.produitId);
            const productDoc = await transaction.get(productRef);

            if (productDoc.exists()) {
                const currentStock = productDoc.data().stock;
                transaction.update(productRef, { stock: currentStock + saleData.quantite });
            }

            transaction.update(saleRef, {
                corrige: true,
                motifCorrection: motif,
                corrigeParNom: currentUser.nom,
                corrigeParId: currentUser.uid
            });

            const logRef = doc(collection(db, "inventory_logs"));
            transaction.set(logRef, {
                produitId: saleData.produitId,
                nomProduit: saleData.nomProduit,
                type: "CORRECTION",
                quantiteModifiee: saleData.quantite,
                motif: `Correction vente : ${motif}`,
                auteurId: currentUser.uid,
                auteurNom: currentUser.nom,
                date: serverTimestamp()
            });
        });

        showAlert("Vente corrigée avec succès. Le stock a été réajusté.", "success");
    } catch (err) {
        showAlert("Erreur lors de la correction : " + err.message, "error");
    }
}

function showAlert(msg, type) {
    const el = document.getElementById('histoAlert');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.className = `alert-box ${type === 'success' ? 'alert-success' : 'alert-error'}`;
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t]||t));
}