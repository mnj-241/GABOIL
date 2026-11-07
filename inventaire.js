// ==========================================================================
// GABOIL — Logique de l'Inventaire & Réapprovisionnement
// ==========================================================================

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, doc, updateDoc, onSnapshot, serverTimestamp, getDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "connexion.html"; return; }
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists() || !userSnap.data().actif) { window.location.href = "connexion.html"; return; }
    
    currentUser = { uid: user.uid, nom: userSnap.data().nom || "Caissière" };
    const userNameEl = document.getElementById('sidebarUserName');
    if (userNameEl) userNameEl.textContent = currentUser.nom;

    initInventoryApp();
});

function initInventoryApp() {
    const restockForm = document.getElementById('restockForm');
    const restockProductSelect = document.getElementById('restockProductSelect');
    const inventoryTableBody = document.getElementById('inventoryTableBody');

    onSnapshot(collection(db, "products"), (snapshot) => {
        restockProductSelect.innerHTML = `<option value="">-- Choisir un produit --</option>`;
        inventoryTableBody.innerHTML = "";

        if (snapshot.empty) {
            inventoryTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--color-gray);">Aucun produit en stock.</td></tr>`;
            return;
        }

        snapshot.forEach(d => {
            const p = { id: d.id, ...d.data() };
            const isActif = p.actif !== false;
            
            // Remplir le select pour le réapprovisionnement
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.nom} (Stock actuel : ${p.stock})`;
            restockProductSelect.appendChild(opt);

            // Remplir le tableau de l'inventaire avec gestion de l'activation (Transition de semaine)
            const valPotentielle = (p.prix || 0) * (p.stock || 0);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(p.nom)}</td>
                <td>${Number(p.prix || 0).toLocaleString('fr-FR')} FCFA</td>
                <td><strong>${p.stock || 0}</strong></td>
                <td>${valPotentielle.toLocaleString('fr-FR')} FCFA</td>
                <td><span class="${isActif ? 'badge-active' : 'badge-inactive'}">${isActif ? 'Actif (En vente)' : 'Désactivé (En pause)'}</span></td>
                <td>
                    <button type="button" class="action-btn toggle-product-btn" data-id="${p.id}" data-name="${escapeHtml(p.nom)}" data-actif="${isActif}" style="${!isActif ? 'background-color: #2e7d32; color: #fff;' : 'background-color: #D71920; color: #fff;'} border: none; padding: 0.3rem 0.6rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">
                        ${isActif ? 'Désactiver' : 'Activer'}
                    </button>
                </td>
            `;
            inventoryTableBody.appendChild(tr);
        });

        // Attacher les écouteurs pour activer/désactiver directement depuis l'inventaire (transition de semaine)
        document.querySelectorAll('.toggle-product-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const productId = e.target.dataset.id;
                const productName = e.target.dataset.name;
                const currentActif = e.target.dataset.actif === 'true';

                const actionText = currentActif ? "désactiver (mettre en pause pour votre semaine)" : "activer (rendre disponible à la vente)";
                const confirmed = window.confirm(`Voulez-vous vraiment ${actionText} le produit "${productName}" ?`);

                if (confirmed) {
                    try {
                        await updateDoc(doc(db, "products", productId), {
                            actif: !currentActif
                        });
                        showAlert(`Produit "${productName}" ${!currentActif ? 'activé' : 'désactivé'} avec succès.`, "success");
                    } catch (err) {
                        showAlert("Erreur lors de la mise à jour du statut : " + err.message, "error");
                    }
                }
            });
        });
    });

    restockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = restockProductSelect.value;
        const qtyToAdd = parseInt(document.getElementById('quantityToAdd').value);
        const motif = document.getElementById('restockMotif').value.trim();

        if (!productId || isNaN(qtyToAdd) || qtyToAdd <= 0) return;

        try {
            await runTransaction(db, async (transaction) => {
                const pRef = doc(db, "products", productId);
                const pDoc = await transaction.get(pRef);
                if (!pDoc.exists()) throw new Error("Produit introuvable.");

                const ancienStock = pDoc.data().stock;
                const nouveauStock = ancienStock + qtyToAdd;

                transaction.update(pRef, { stock: nouveauStock });

                // Enregistrer le mouvement de stock
                const logRef = doc(collection(db, "inventory_logs"));
                transaction.set(logRef, {
                    produitId: productId,
                    nomProduit: pDoc.data().nom,
                    type: "ENTREE_STOCK",
                    quantiteModifiee: qtyToAdd,
                    ancienStock,
                    nouveauStock,
                    motif,
                    auteurId: currentUser.uid,
                    auteurNom: currentUser.nom,
                    date: serverTimestamp()
                });
            });

            showAlert("Réapprovisionnement enregistré avec succès ! Stock mis à jour.", "success");
            restockForm.reset();
        } catch (err) {
            showAlert("Erreur : " + err.message, "error");
        }
    });
}

function showAlert(msg, type) {
    const el = document.getElementById('invAlert');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.className = `alert-box ${type === 'success' ? 'alert-success' : 'alert-error'}`;
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t]||t));
}