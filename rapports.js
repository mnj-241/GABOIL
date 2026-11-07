// ==========================================================================
// GABOIL — Logique des Rapports & Analyse Détaillée (Sécurisé par Rôle)
// ==========================================================================

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { exportToExcelMultiSheet, exportToPDF } from './archives.js';

let currentReportBundle = null; 
let rawReportDataForPDF = null;
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

        const userNameEl = document.getElementById('sidebarUserName');
        if (userNameEl) userNameEl.textContent = currentUserProfile.nom || "Utilisateur";
        
        loadReports();
    } catch (e) {
        console.error("Erreur d'authentification rapport :", e);
        window.location.href = "connexion.html";
    }
});

async function loadReports() {
    try {
        const [salesSnap, productsSnap, usersSnap, logsSnap] = await Promise.all([
            getDocs(query(collection(db, "sales"), orderBy("date", "desc"))),
            getDocs(collection(db, "products")),
            getDocs(collection(db, "users")),
            getDocs(query(collection(db, "inventory_logs"), orderBy("date", "desc")))
        ]);

        let todayRev = 0;
        let monthRev = 0;
        const nowLibreville = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Libreville" }));
        const todayStr = formatDateKey(nowLibreville);
        const currentMonth = nowLibreville.getMonth();
        const currentYear = nowLibreville.getFullYear();

        const productSalesStats = {};
        const allSalesList = [];
        const cashiersMap = {}; 

        let totalSalesCount = 0;
        let validSalesCount = 0;
        let correctedSalesCount = 0;
        let totalUnitsSold = 0;

        // Traitement global des ventes
        salesSnap.forEach(d => {
            const s = { id: d.id, ...d.data() };
            
            // SÉCURITÉ : Si l'utilisateur est une CAISSIÈRE, on ignore complètement les ventes des autres
            if (currentUserProfile.role !== "ADMIN" && s.caissiereId !== currentUserProfile.uid) {
                return;
            }

            allSalesList.push(s);

            const cashierId = s.caissiereId || "inconnu";
            const cashierName = s.caissiereNom || "Caissière Inconnue";

            if (!cashiersMap[cashierId]) {
                cashiersMap[cashierId] = {
                    id: cashierId,
                    nom: cashierName,
                    totalTransactions: 0,
                    validTransactions: 0,
                    correctedTransactions: 0,
                    totalRevenue: 0,
                    totalUnits: 0,
                    productsSold: {},
                    salesList: []
                };
            }

            cashiersMap[cashierId].totalTransactions++;
            cashiersMap[cashierId].salesList.push(s);

            if (s.date) {
                const sDateObj = s.date.toDate();
                const localDateObj = new Date(sDateObj.toLocaleString("en-US", { timeZone: "Africa/Libreville" }));
                const sDateStr = formatDateKey(localDateObj);
                const amount = s.montantTotal || 0;
                const qty = s.quantite || 0;

                totalSalesCount++;
                if (s.corrige) {
                    correctedSalesCount++;
                    cashiersMap[cashierId].correctedTransactions++;
                } else {
                    validSalesCount++;
                    cashiersMap[cashierId].validTransactions++;
                    totalUnitsSold += qty;
                    cashiersMap[cashierId].totalUnits += qty;
                    cashiersMap[cashierId].totalRevenue += amount;

                    // Stats par produit
                    if (!productSalesStats[s.produitId]) {
                        productSalesStats[s.produitId] = { nom: s.nomProduit || "Inconnu", qte: 0, total: 0, prixUnitaire: s.prixUnitaire || 0 };
                    }
                    productSalesStats[s.produitId].qte += qty;
                    productSalesStats[s.produitId].total += amount;

                    if (!cashiersMap[cashierId].productsSold[s.produitId]) {
                        cashiersMap[cashierId].productsSold[s.produitId] = {
                            nom: s.nomProduit || "Inconnu",
                            qte: 0,
                            prixUnitaire: s.prixUnitaire || 0,
                            total: 0
                        };
                    }
                    cashiersMap[cashierId].productsSold[s.produitId].qte += qty;
                    cashiersMap[cashierId].productsSold[s.produitId].total += amount;

                    if (sDateStr === todayStr) {
                        todayRev += amount;
                    }
                    if (localDateObj.getMonth() === currentMonth && localDateObj.getFullYear() === currentYear) {
                        monthRev += amount;
                    }
                }
            }
        });

        // Affichage UI Synthèse (Personnelle ou Globale selon le rôle)
        const repTodayEl = document.getElementById('repToday');
        const repMonthEl = document.getElementById('repMonth');
        if (repTodayEl) repTodayEl.textContent = todayRev.toLocaleString('fr-FR') + " FCFA";
        if (repMonthEl) repMonthEl.textContent = monthRev.toLocaleString('fr-FR') + " FCFA";

        let totalStockValue = 0;
        let activeProductsCount = 0;
        let inactiveProductsCount = 0;
        const productsList = [];
        const lowStockList = [];

        productsSnap.forEach(d => {
            const p = { id: d.id, ...d.data() };
            productsList.push(p);
            if (p.actif !== false) activeProductsCount++;
            else inactiveProductsCount++;

            totalStockValue += (p.prix || 0) * (p.stock || 0);
            if ((p.stock || 0) <= 5) {
                lowStockList.push(p.nom);
            }
        });

        const stockValueEl = document.getElementById('stockValue');
        if (stockValueEl) stockValueEl.textContent = totalStockValue.toLocaleString('fr-FR') + " FCFA";

        const logsList = [];
        logsSnap.forEach(d => { 
            // Si caissière, on filtre les logs si nécessaire ou on garde les logs généraux de stock
            logsList.push({ id: d.id, ...d.data() }); 
        });

        const statsArray = Object.values(productSalesStats);
        const tbody = document.getElementById('reportTableBody');
        if (tbody) {
            tbody.innerHTML = "";
            if (statsArray.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--color-gray);">Aucune donnée de vente enregistrée.</td></tr>`;
            } else {
                statsArray.forEach(st => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${escapeHtml(st.nom)}</td>
                        <td><strong>${st.qte}</strong></td>
                        <td>${st.total.toLocaleString('fr-FR')} FCFA</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        }

        const cashiersSummaryArray = Object.values(cashiersMap).map(c => ({
            ...c,
            productsList: Object.values(c.productsSold)
        }));

        // Préparation du bundle Excel et PDF (adapté au rôle)
        currentReportBundle = buildExcelBundle({
            todayRev, monthRev, totalSalesCount, validSalesCount, correctedSalesCount,
            totalUnitsSold, activeProductsCount, inactiveProductsCount, totalStockValue,
            statsArray, allSalesList, productsList, logsList, cashiersSummaryArray,
            isAdmin: currentUserProfile.role === "ADMIN"
        });

        rawReportDataForPDF = {
            userName: currentUserProfile.nom,
            isAdmin: currentUserProfile.role === "ADMIN",
            todayRevenue: todayRev,
            monthRevenue: monthRev,
            totalSalesCount: validSalesCount,
            totalUnitsSold: totalUnitsSold,
            correctionCount: correctedSalesCount,
            stockPotentialValue: totalStockValue,
            productsSoldList: statsArray,
            lowStockProducts: lowStockList,
            cashiersActivity: cashiersSummaryArray,
            logsList: logsList
        };

        // Bouton Excel
        const exportExcelBtn = document.getElementById('exportExcelBtn');
        if (exportExcelBtn) {
            exportExcelBtn.onclick = () => {
                const sheets = currentUserProfile.role === "ADMIN" ? {
                    "Synthèse Générale": currentReportBundle.synthese,
                    "Comparatif Caissières": currentReportBundle.comparatifCaissieres,
                    "Journal Activités": currentReportBundle.journalActivites,
                    "Historique Ventes": currentReportBundle.historiqueVentes,
                    "Inventaire Stock": currentReportBundle.inventaireExport
                } : {
                    "Mon Bilan Personnel": currentReportBundle.synthese,
                    "Mes Ventes": currentReportBundle.historiqueVentes,
                    "Inventaire Station": currentReportBundle.inventaireExport
                };

                exportToExcelMultiSheet(sheets, currentUserProfile.role === "ADMIN" ? "Rapport_General_GABOIL.xlsx" : `Rapport_${currentUserProfile.nom.replace(/\s+/g, '_')}.xlsx`);
            };
        }

        // Bouton PDF
        const exportPdfBtn = document.getElementById('exportPdfBtn');
        if (exportPdfBtn) {
            exportPdfBtn.onclick = () => {
                exportToPDF(rawReportDataForPDF, currentUserProfile.role === "ADMIN" ? "Rapport_Synthese_GABOIL.pdf" : `Rapport_Personnel_${currentUserProfile.nom.replace(/\s+/g, '_')}.pdf`);
            };
        }

    } catch (e) { 
        console.error("Erreur rapports:", e); 
    }
}

function buildExcelBundle(data) {
    const nowStr = new Date().toLocaleString("en-US", { timeZone: "Africa/Libreville" });

    const synthese = [
        { "Indicateur GABOIL": data.isAdmin ? "RAPPORT GÉNÉRAL D'ACTIVITÉ" : "RAPPORT PERSONNEL CAISSIÈRE", "Valeur": nowStr },
        { "Indicateur GABOIL": "Chiffre d'Affaires du Jour (Réel)", "Valeur": `${data.todayRev.toLocaleString('fr-FR')} FCFA` },
        { "Indicateur GABOIL": "Chiffre d'Affaires du Mois (Réel)", "Valeur": `${data.monthRev.toLocaleString('fr-FR')} FCFA` },
        { "Indicateur GABOIL": "Nombre Total de Ventes Validées", "Valeur": data.validSalesCount },
        { "Indicateur GABOIL": "Nombre de Ventes Corrigées", "Valeur": data.correctedSalesCount },
        { "Indicateur GABOIL": "Total Unités Vendues", "Valeur": data.totalUnitsSold },
        { "Indicateur GABOIL": "Valeur Potentielle du Stock Restant", "Valeur": `${data.totalStockValue.toLocaleString('fr-FR')} FCFA` }
    ];

    const comparatifCaissieres = data.cashiersSummaryArray.map(c => ({
        "Nom de la Caissière": c.nom,
        "Total Transactions": c.totalTransactions,
        "Ventes Validées": c.validTransactions,
        "Ventes Corrigées": c.correctedTransactions,
        "Unités Vendues": c.totalUnits,
        "Chiffre d'Affaires Réel (FCFA)": c.totalRevenue
    }));

    const journalActivites = data.logsList.map(log => {
        const logDateObj = log.date ? log.date.toDate() : new Date();
        const localDate = new Date(logDateObj.toLocaleString("en-US", { timeZone: "Africa/Libreville" }));
        return {
            "Date": localDate.toLocaleDateString('fr-FR'),
            "Heure": localDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            "Auteur": log.auteurNom || "Système",
            "Action": log.type || "ACTION",
            "Produit": log.nomProduit || "N/A",
            "Description": log.motif || log.description || "-"
        };
    });

    const historiqueVentes = data.allSalesList.map(s => {
        const saleDateObj = s.date ? s.date.toDate() : new Date();
        const localDate = new Date(saleDateObj.toLocaleString("en-US", { timeZone: "Africa/Libreville" }));
        return {
            "Date": localDate.toLocaleDateString('fr-FR'),
            "Heure": localDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            "Caissière": s.caissiereNom || "Inconnu",
            "Produit": s.nomProduit || "N/A",
            "Quantité": s.quantite || 0,
            "Prix Unitaire (FCFA)": s.prixUnitaire || 0,
            "Montant Total (FCFA)": s.montantTotal || 0,
            "Statut": s.corrige ? "Corrigée" : "Validée",
            "Motif Correction": s.motifCorrection || "-"
        };
    });

    const inventaireExport = data.productsList.map(p => ({
        "Nom du Produit": p.nom || "N/A",
        "Stock Actuel": p.stock || 0,
        "Prix Unitaire (FCFA)": p.prix || 0,
        "Valeur Potentielle (FCFA)": (p.prix || 0) * (p.stock || 0),
        "État": p.actif !== false ? "Actif" : "Désactivé"
    }));

    return { synthese, comparatifCaissieres, journalActivites, historiqueVentes, inventaireExport };
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