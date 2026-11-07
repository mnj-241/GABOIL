import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, updateDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "connexion.html"; return; }
    
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists() || !userSnap.data().actif || userSnap.data().role !== "ADMIN") {
        await signOut(auth);
        window.location.href = "connexion.html";
        return;
    }

    document.getElementById('adminName').textContent = userSnap.data().nom || "Chef";
    initAdminDashboard();
});

function initAdminDashboard() {
    const logoutBtn = document.getElementById('logoutAdminBtn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await signOut(auth);
            window.location.href = "connexion.html";
        });
    }

    // 1. Écouter et charger les comptes utilisateurs (Caissières)
    onSnapshot(collection(db, "users"), (snapshot) => {
        const tbody = document.getElementById('cashiersTableBody');
        tbody.innerHTML = "";

        snapshot.forEach(d => {
            const u = { id: d.id, ...d.data() };
            if (u.role === "CAISSIERE") {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(u.nom || "Inconnu")}</td>
                    <td>${u.role}</td>
                    <td><span class="${u.actif === true ? 'badge-active' : 'badge-inactive'}">${u.actif === true ? 'Actif' : 'Inactif'}</span></td>
                    <td>
                        <button class="btn-toggle-status" data-id="${u.id}" data-actif="${u.actif === true}">
                            ${u.actif === true ? 'Désactiver' : 'Activer'}
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        });

        // Activer / Désactiver un compte caissière
        document.querySelectorAll('.btn-toggle-status').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const uid = e.target.dataset.id;
                const currentActif = e.target.dataset.actif === 'true';
                try {
                    await updateDoc(doc(db, "users", uid), {
                        actif: !currentActif
                    });
                    showAdminAlert("Statut du compte mis à jour avec succès.", "success");
                } catch (err) {
                    showAdminAlert("Erreur lors de la mise à jour : " + err.message, "error");
                }
            });
        });
    });

    // 2. Charger les statistiques globales et le journal des ventes
    const qSales = query(collection(db, "sales"), orderBy("date", "desc"));
    onSnapshot(qSales, async (salesSnap) => {
        let totalRevenue = 0;
        let totalSalesCount = 0;
        const salesList = [];

        salesSnap.forEach(d => {
            const s = d.data();
            salesList.push(s);
            if (!s.corrige) {
                totalRevenue += (s.montantTotal || 0);
                totalSalesCount++;
            }
        });

        document.getElementById('adminTotalRevenue').textContent = totalRevenue.toLocaleString('fr-FR') + " FCFA";
        document.getElementById('adminTotalSales').textContent = totalSalesCount;

        // Calcul de la valeur du stock restant
        const productsSnap = await getDocs(collection(db, "products"));
        let stockVal = 0;
        productsSnap.forEach(d => {
            const p = d.data();
            stockVal += (p.prix || 0) * (p.stock || 0);
        });
        document.getElementById('adminStockValue').textContent = stockVal.toLocaleString('fr-FR') + " FCFA";

        // Remplir le tableau des ventes globales
        const salesTbody = document.getElementById('adminSalesTableBody');
        salesTbody.innerHTML = "";

        if (salesList.length === 0) {
            salesTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--color-gray);">Aucune vente enregistrée.</td></tr>`;
            return;
        }

        salesList.slice(0, 50).forEach(s => { // Limiter aux 50 dernières pour la performance
            const dateStr = s.date ? s.date.toDate().toLocaleString('fr-FR') : "Date inconnue";
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${escapeHtml(s.nomProduit)}</td>
                <td>${s.quantite}</td>
                <td><strong>${Number(s.montantTotal).toLocaleString('fr-FR')} FCFA</strong></td>
                <td>${escapeHtml(s.caissiereNom)}</td>
                <td><span class="${!s.corrige ? 'badge-active' : 'badge-inactive'}">${!s.corrige ? 'Validée' : 'Corrigée'}</span></td>
            `;
            salesTbody.appendChild(tr);
        });
    });
}

function showAdminAlert(msg, type) {
    const el = document.getElementById('adminAlert');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.className = `alert-box ${type === 'success' ? 'alert-success' : 'alert-error'}`;
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t]||t));
}