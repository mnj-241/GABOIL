// ==========================================================================
// GABOIL — Gestion du Catalogue Produits
// ==========================================================================

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, addDoc, updateDoc, doc, onSnapshot, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let allProducts = [];
let editingId = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "connexion.html"; return; }
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists() || !userSnap.data().actif) { window.location.href = "connexion.html"; return; }
    
    const userNameEl = document.getElementById('sidebarUserName');
    if (userNameEl) userNameEl.textContent = userSnap.data().nom || "Caissière";
    
    initProductsApp();
});

function initProductsApp() {
    const productForm = document.getElementById('productForm');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const searchCatalog = document.getElementById('searchCatalog');

    // Écoute en temps réel des produits
    onSnapshot(collection(db, "products"), (snapshot) => {
        allProducts = [];
        snapshot.forEach(d => allProducts.push({ id: d.id, ...d.data() }));
        renderProducts(allProducts);
    });

    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nom = document.getElementById('productName').value.trim();
        const prix = parseFloat(document.getElementById('productPrice').value);
        const stock = parseInt(document.getElementById('productStock').value);

        if (!nom || isNaN(prix) || isNaN(stock)) return;

        try {
            if (editingId) {
                // Modification (sans modifier le stock via ce formulaire simple)
                await updateDoc(doc(db, "products", editingId), { nom, prix });
                showAlert("Produit modifié avec succès !", "success");
                resetForm();
            } else {
                // Ajout
                await addDoc(collection(db, "products"), {
                    nom, prix, stock, actif: true, dateCreation: serverTimestamp()
                });
                showAlert("Produit ajouté avec succès !", "success");
                productForm.reset();
            }
        } catch (err) {
            showAlert("Erreur : " + err.message, "error");
        }
    });

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', resetForm);
    }

    if (searchCatalog) {
        searchCatalog.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            renderProducts(allProducts.filter(p => p.nom.toLowerCase().includes(q)));
        });
    }
}

function renderProducts(list) {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = "";
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--color-gray);">Aucun produit trouvé.</td></tr>`;
        return;
    }

    list.forEach(p => {
        const isActif = p.actif !== false;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(p.nom)}</td>
            <td>${Number(p.prix).toLocaleString('fr-FR')} FCFA</td>
            <td><strong>${p.stock}</strong></td>
            <td><span class="${isActif ? 'badge-active' : 'badge-inactive'}">${isActif ? 'Actif' : 'Désactivé'}</span></td>
            <td>
                <button class="action-btn edit-btn" data-id="${p.id}">Modifier</button>
                <button class="action-btn toggle-btn" data-id="${p.id}" data-name="${escapeHtml(p.nom)}" data-actif="${isActif}" style="${!isActif ? 'background-color: #2e7d32; color: #fff;' : 'background-color: #D71920; color: #fff;'} border: none; padding: 0.3rem 0.6rem; border-radius: 4px; cursor: pointer;">
                    ${isActif ? 'Désactiver' : 'Réactiver'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Attacher les événements de modification
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const p = allProducts.find(x => x.id === id);
            if (p) {
                editingId = id;
                document.getElementById('productName').value = p.nom;
                document.getElementById('productPrice').value = p.prix;
                document.getElementById('productStock').value = p.stock;
                document.getElementById('productStock').disabled = true; // Empêcher la modif directe du stock ici
                document.getElementById('formTitle').textContent = "Modifier le produit";
                document.getElementById('saveProductBtn').textContent = "Mettre à jour";
                document.getElementById('cancelEditBtn').style.display = "inline-flex";
            }
        });
    });

    // Attacher les événements de bascule Actif / Désactivé avec confirmation
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const name = e.target.dataset.name;
            const currentActif = e.target.dataset.actif === 'true';
            
            const actionText = currentActif ? "désactiver" : "réactiver";
            const confirmed = window.confirm(`Voulez-vous vraiment ${actionText} le produit "${name}" ?`);
            
            if (confirmed) {
                try {
                    await updateDoc(doc(db, "products", id), { actif: !currentActif });
                    showAlert(`Produit "${name}" ${currentActif ? 'désactivé' : 'réactivé'} avec succès.`, "success");
                } catch (err) { 
                    showAlert("Erreur : " + err.message, "error"); 
                }
            }
        });
    });
}

function resetForm() {
    editingId = null;
    const form = document.getElementById('productForm');
    if (form) form.reset();
    document.getElementById('productStock').disabled = false;
    document.getElementById('formTitle').textContent = "Ajouter un produit";
    document.getElementById('saveProductBtn').textContent = "Enregistrer";
    document.getElementById('cancelEditBtn').style.display = "none";
}

function showAlert(msg, type) {
    const el = document.getElementById('productAlert');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.className = `alert-box ${type === 'success' ? 'alert-success' : 'alert-error'}`;
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t]||t));
}