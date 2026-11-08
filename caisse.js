// ==========================================================================
// GABOIL — Logique Métier de l'Espace Caissière (Sans calculatrice)
// ==========================================================================

import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, 
    doc, 
    getDoc, 
    onSnapshot, 
    runTransaction, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Variables d'état global ---
let currentCashier = {
    uid: null,
    nom: "Inconnu",
    role: null
};

let productsCatalog = {}; // Stocke les produits récupérés de Firestore (id -> data)
let cart = [];            // Liste des articles sélectionnés { id, nom, prix, stock, quantite }

// --- Éléments du DOM ---
const cashierNameEl = document.getElementById('cashierName');
const logoutBtn = document.getElementById('logoutBtn');
const caisseAlert = document.getElementById('caisseAlert');
const productsContainer = document.getElementById('productsContainer');
const searchProductInput = document.getElementById('searchProductInput');
const cartTableBody = document.getElementById('cartTableBody');
const cartTotalAmountEl = document.getElementById('cartTotalAmount');
const validateSaleBtn = document.getElementById('validateSaleBtn');

const montantRecuInput = document.getElementById('montantRecu');
const monnaieARendreEl = document.getElementById('monnaieARendre');

// Modale
const confirmModal = document.getElementById('confirmModal');
const modalSummaryContent = document.getElementById('modalSummaryContent');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');

// ==========================================================================
// 1. SÉCURITÉ & AUTHENTIFICATION
// ==========================================================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // Non connecté -> Redirection vers la page de connexion
        window.location.href = "connexion.html";
        return;
    }

    try {
        // Vérification du profil dans Firestore (users/{uid})
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            await signOut(auth);
            showAlert("Accès refusé : Aucun profil trouvé.", "error");
            setTimeout(() => window.location.href = "connexion.html", 2000);
            return;
        }

        const userData = userDocSnap.data();

        // Vérification du statut actif et du rôle
        if (userData.actif !== true || (userData.role !== "CAISSIERE" && userData.role !== "ADMIN")) {
            await signOut(auth);
            showAlert("Accès refusé : Compte inactif ou rôle non autorisé.", "error");
            setTimeout(() => window.location.href = "connexion.html", 2000);
            return;
        }

        // Stockage des infos de la caissière connectée
        currentCashier.uid = user.uid;
        currentCashier.nom = userData.nom || "Caissière GABOIL";
        currentCashier.role = userData.role;

        cashierNameEl.textContent = currentCashier.nom;

        // Une fois authentifié et vérifié, on initialise l'application
        initApp();

    } catch (error) {
        console.error("Erreur d'authentification caisse :", error);
        showAlert("Erreur lors de la vérification du profil.", "error");
    }
});

// Gestion de la déconnexion
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = "connexion.html";
    } catch (error) {
        console.error("Erreur lors de la déconnexion :", error);
    }
});

// ==========================================================================
// 2. INITIALISATION DE L'APPLICATION
// ==========================================================================
function initApp() {
    loadProductsCatalog();
    setupPaymentAndMonnaie();
    setupModalHandlers();
}

// ==========================================================================
// 3. CHARGEMENT DYNAMIQUE DU CATALOGUE (Firestore en temps réel)
// ==========================================================================
function loadProductsCatalog() {
    const productsRef = collection(db, "products");

    onSnapshot(productsRef, (snapshot) => {
        productsContainer.innerHTML = "";
        productsCatalog = {};

        if (snapshot.empty) {
            productsContainer.innerHTML = `<div class="loading-products">Aucun produit disponible dans le stock.</div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const product = { id: docSnap.id, ...docSnap.data() };
            // On ne stocke et affiche que les produits actifs (actif != false)
            if (product.actif !== false) {
                productsCatalog[product.id] = product;
            }
        });

        renderProducts(Object.values(productsCatalog));
    }, (error) => {
        console.error("Erreur de chargement des produits :", error);
        productsContainer.innerHTML = `<div class="loading-products">Erreur de chargement du stock.</div>`;
    });
}

// Affichage des cartes produits dans le catalogue
function renderProducts(productsList) {
    productsContainer.innerHTML = "";

    if (productsList.length === 0) {
        productsContainer.innerHTML = `<div class="loading-products">Aucun produit actif ne correspond à votre recherche.</div>`;
        return;
    }

    productsList.forEach(product => {
        const isLowStock = product.stock <= 5;
        
        const card = document.createElement('div');
        card.className = 'product-item-card';
        card.innerHTML = `
            <div class="product-info">
                <h4>${escapeHtml(product.nom)}</h4>
                <div class="product-meta">
                    <span class="product-price">${formatNumber(product.prix)} FCFA</span>
                    <span class="product-stock ${isLowStock ? 'low-stock' : ''}">Stock : ${product.stock}</span>
                </div>
            </div>
            <div class="product-action-badge">+ Sélectionner</div>
        `;

        // Clic pour ajouter au panier
        card.addEventListener('click', () => {
            addToCart(product.id);
        });

        productsContainer.appendChild(card);
    });
}

// Filtrage en direct via la barre de recherche
searchProductInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = Object.values(productsCatalog).filter(p => 
        p.nom.toLowerCase().includes(query)
    );
    renderProducts(filtered);
});

// ==========================================================================
// 4. GESTION DU PANIER & QUANTITÉS
// ==========================================================================
function addToCart(productId) {
    const product = productsCatalog[productId];
    if (!product) return;

    // Vérifier si le produit est déjà dans le panier
    const existingItem = cart.find(item => item.id === productId);

    if (existingItem) {
        existingItem.quantite += 1;
    } else {
        cart.push({
            id: product.id,
            nom: product.nom,
            prix: product.prix,
            stock: product.stock,
            quantite: 1
        });
    }

    updateCartUI();
}

function updateCartUI() {
    cartTableBody.innerHTML = "";

    if (cart.length === 0) {
        cartTableBody.innerHTML = `
            <tr class="empty-cart-row">
                <td colspan="5">Aucun produit sélectionné</td>
            </tr>
        `;
        cartTotalAmountEl.textContent = "0 FCFA";
        validateSaleBtn.disabled = true;
        calculateMonnaie();
        return;
    }

    let totalGeneral = 0;

    cart.forEach((item, index) => {
        const sousTotal = item.prix * item.quantite;
        totalGeneral += sousTotal;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(item.nom)}</td>
            <td>${formatNumber(item.prix)}</td>
            <td>
                <input type="number" min="1" value="${item.quantite}" class="cart-qty-input" data-index="${index}">
            </td>
            <td><strong>${formatNumber(sousTotal)} FCFA</strong></td>
            <td>
                <button type="button" class="btn-remove-item" data-index="${index}" title="Retirer">×</button>
            </td>
        `;
        cartTableBody.appendChild(row);
    });

    cartTotalAmountEl.textContent = formatNumber(totalGeneral) + " FCFA";
    validateSaleBtn.disabled = false;
    calculateMonnaie();

    // Attacher les écouteurs sur les nouveaux champs de quantité et boutons supprimer
    document.querySelectorAll('.cart-qty-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            let val = parseInt(e.target.value);
            if (isNaN(val) || val < 1) val = 1;
            cart[idx].quantite = val;
            updateCartUI(); // Rafraîchit les sous-totaux et la monnaie
        });
    });

    document.querySelectorAll('.btn-remove-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            cart.splice(idx, 1);
            updateCartUI();
        });
    });
}

// ==========================================================================
// 5. GESTION DES PAIEMENTS ET CALCUL DE LA MONNAIE
// ==========================================================================
function setupPaymentAndMonnaie() {
    montantRecuInput.addEventListener('input', calculateMonnaie);
}

function calculateMonnaie() {
    const montantRecu = parseFloat(montantRecuInput.value) || 0;
    const totalGeneral = cart.reduce((sum, item) => sum + (item.prix * item.quantite), 0);

    const monnaie = montantRecu - totalGeneral;

    if (monnaie >= 0 && totalGeneral > 0) {
        monnaieARendreEl.textContent = formatNumber(monnaie) + " FCFA";
        monnaieARendreEl.style.color = "#4caf50";
    } else if (totalGeneral === 0) {
        monnaieARendreEl.textContent = "0 FCFA";
        monnaieARendreEl.style.color = "var(--color-gray)";
    } else {
        monnaieARendreEl.textContent = "Insuffisant (-" + formatNumber(Math.abs(monnaie)) + " FCFA)";
        monnaieARendreEl.style.color = "#ff8a8d";
    }
}

// ==========================================================================
// 6. VALIDATION DES VENTES & TRANSACTIONS FIRESTORE
// ==========================================================================
validateSaleBtn.addEventListener('click', () => {
    if (cart.length === 0) return;

    // Générer le récapitulatif pour la modale
    let totalGeneral = 0;
    let htmlSummary = `<p><strong>Caissière :</strong> ${escapeHtml(currentCashier.nom)}</p><br>`;
    htmlSummary += `<ul style="list-style: none; padding: 0;">`;

    cart.forEach(item => {
        const sousTotal = item.prix * item.quantite;
        totalGeneral += sousTotal;
        htmlSummary += `<li style="margin-bottom: 0.5rem; border-bottom: 1px solid #2a2a30; padding-bottom: 0.4rem;">
            ${escapeHtml(item.nom)} × ${item.quantite} = <strong>${formatNumber(sousTotal)} FCFA</strong>
        </li>`;
    });

    htmlSummary += `</ul>`;
    htmlSummary += `<p style="margin-top: 1rem; font-size: 1.1rem;"><strong>Total à payer : ${formatNumber(totalGeneral)} FCFA</strong></p>`;
    
    const montantRecu = parseFloat(montantRecuInput.value) || 0;
    if (montantRecu > 0) {
        const monnaie = montantRecu - totalGeneral;
        htmlSummary += `<p>Montant reçu : ${formatNumber(montantRecu)} FCFA</p>`;
        htmlSummary += `<p style="color: #4caf50;">Monnaie à rendre : ${formatNumber(monnaie >= 0 ? monnaie : 0)} FCFA</p>`;
    }

    modalSummaryContent.innerHTML = htmlSummary;
    confirmModal.style.display = 'flex';
});

function setupModalHandlers() {
    modalCancelBtn.addEventListener('click', () => {
        confirmModal.style.display = 'none';
    });

    modalConfirmBtn.addEventListener('click', async () => {
        confirmModal.style.display = 'none';
        await processSaleTransaction();
    });
}

// Exécution de la transaction atomique Firestore pour chaque produit du panier
async function processSaleTransaction() {
    if (cart.length === 0) return;

    validateSaleBtn.disabled = true;
    validateSaleBtn.textContent = "Enregistrement en cours...";

    try {
        let stockWarningTriggered = false;

        // Utilisation d'une transaction Firestore pour garantir la cohérence du stock partagé
        await runTransaction(db, async (transaction) => {
            // 1. Vérification préalable des stocks en base
            for (const item of cart) {
                const productRef = doc(db, "products", item.id);
                const productDoc = await transaction.get(productRef);

                if (!productDoc.exists()) {
                    throw new Error(`Le produit ${item.nom} n'existe plus dans le catalogue.`);
                }

                const currentStock = productDoc.data().stock;
                if (item.quantite > currentStock) {
                    stockWarningTriggered = true;
                }
            }

            // 2. Mise à jour des stocks et création des enregistrements de vente
            for (const item of cart) {
                const productRef = doc(db, "products", item.id);
                const productDoc = await transaction.get(productRef);
                const currentStock = productDoc.data().stock;
                const newStock = currentStock - item.quantite;

                // Mise à jour du stock partagé
                transaction.update(productRef, { stock: newStock });

                // Création d'un document de vente individuel dans la collection 'sales'
                const saleRef = doc(collection(db, "sales"));
                transaction.set(saleRef, {
                    produitId: item.id,
                    nomProduit: item.nom,
                    quantite: item.quantite,
                    prixUnitaire: item.prix,
                    montantTotal: item.prix * item.quantite,
                    caissiereId: currentCashier.uid,
                    caissiereNom: currentCashier.nom,
                    date: serverTimestamp(),
                    stockInsuffisantConfirme: stockWarningTriggered,
                    corrige: false
                });
            }
        });

        // Succès
        showAlert("Vente validée avec succès ! Stock mis à jour.", "success");
        
        // Réinitialisation du panier et des champs
        cart = [];
        montantRecuInput.value = "";
        updateCartUI();

    } catch (error) {
        console.error("Erreur lors de la transaction de vente :", error);
        showAlert("Erreur : " + error.message, "error");
    } finally {
        validateSaleBtn.textContent = "Valider la vente";
    }
}

// ==========================================================================
// 7. UTILITAIRES (Affichage, Sécurité XSS, Formatage)
// ==========================================================================
function showAlert(message, type = 'error') {
    caisseAlert.textContent = message;
    caisseAlert.style.display = 'block';
    caisseAlert.className = `caisse-alert ${type === 'success' ? 'alert-success' : 'alert-error'}`;

    setTimeout(() => {
        caisseAlert.style.display = 'none';
    }, 5000);
}

function formatNumber(num) {
    return Number(num).toLocaleString('fr-FR');
}

function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}
