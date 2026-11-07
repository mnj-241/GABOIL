// ==========================================================================
// GABOIL — Module de Génération de Documents & Archives (PDF, Excel, Word)
// ==========================================================================

import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export async function exportToExcel(dataArray, filename = "Rapport_GABOIL.xlsx", sheetName = "Données") {
    try {
        if (typeof XLSX === 'undefined') { alert("La bibliothèque SheetJS n'est pas chargée."); return; }
        const worksheet = XLSX.utils.json_to_sheet(dataArray);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, filename);
        await logArchiveMetadata(filename, "EXCEL");
    } catch (e) { console.error("Erreur Excel :", e); }
}

export async function exportToExcelMultiSheet(sheetsObject, filename = "Rapport_General_GABOIL.xlsx") {
    try {
        if (typeof XLSX === 'undefined') { alert("La bibliothèque SheetJS n'est pas chargée."); return; }
        const workbook = XLSX.utils.book_new();
        for (const [sheetName, dataArray] of Object.entries(sheetsObject)) {
            if (Array.isArray(dataArray) && dataArray.length > 0) {
                const worksheet = XLSX.utils.json_to_sheet(dataArray);
                XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
            }
        }
        XLSX.writeFile(workbook, filename);
        await logArchiveMetadata(filename, "EXCEL_MULTISHEET");
    } catch (e) { console.error("Erreur Multi-sheet :", e); }
}

export async function exportToWord(title, contentHTML, filename = "Document_GABOIL.doc") {
    try {
        const fullHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family: Arial, sans-serif; padding: 20px;"><h1>${title}</h1>${contentHTML}</body></html>`;
        const blob = new Blob(['\ufeff' + fullHTML], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        await logArchiveMetadata(filename, "WORD");
    } catch (e) { console.error("Erreur Word :", e); }
}

/**
 * Génère et télécharge le rapport PDF de synthèse haut de gamme avec Activité Détaillée par Caissière
 */
export async function exportToPDF(reportData, filename = "Rapport_Synthese_GABOIL.pdf") {
    try {
        if (typeof window.jspdf === 'undefined') { alert("La bibliothèque jsPDF n'est pas chargée."); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const primaryColor = [215, 25, 32];   // Rouge GABOIL (#D71920)
        const darkColor = [17, 17, 20];       // Anthracite (#111114)
        const grayColor = [119, 119, 125];    // Gris (#77777D)
        const lightBg = [244, 244, 246];      // Gris clair

        let currentY = 15;

        // --- EN-TÊTE PROFESSIONNEL ---
        doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.rect(0, 0, 210, 28, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("GABOIL — RAPPORT DE SYNTHÈSE & ACTIVITÉ CAISSIÈRES", 14, 12);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Généré le : ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Libreville' })} | Responsable : ${reportData.userName || 'Admin'}`, 14, 20);

        currentY = 36;

        // --- SECTION 1 : INDICATEURS GLOBAUX ---
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("1. Indicateurs Financiers Globaux", 14, currentY);
        currentY += 5;

        const kpis = [
            { label: "Chiffre d'Affaires du Jour", val: `${Number(reportData.todayRevenue || 0).toLocaleString('fr-FR')} FCFA` },
            { label: "Chiffre d'Affaires du Mois", val: `${Number(reportData.monthRevenue || 0).toLocaleString('fr-FR')} FCFA` },
            { label: "Transactions Validées", val: reportData.totalSalesCount || 0 },
            { label: "Unités Globales Vendues", val: reportData.totalUnitsSold || 0 },
            { label: "Corrections / Annulations", val: reportData.correctionCount || 0 },
            { label: "Valeur Potentielle Stock", val: `${Number(reportData.stockPotentialValue || 0).toLocaleString('fr-FR')} FCFA` }
        ];

        let startX = 14;
        let startY = currentY;
        let boxWidth = 58;
        let boxHeight = 15;
        let colCount = 3;

        kpis.forEach((kpi, index) => {
            let col = index % colCount;
            let row = Math.floor(index / colCount);
            let posX = startX + col * (boxWidth + 4);
            let posY = startY + row * (boxHeight + 3);

            doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
            doc.roundedRect(posX, posY, boxWidth, boxHeight, 2, 2, 'F');

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
            doc.text(kpi.label.toUpperCase(), posX + 4, posY + 5.5);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.5);
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.text(String(kpi.val), posX + 4, posY + 12);
        });

        currentY += Math.ceil(kpis.length / colCount) * (boxHeight + 3) + 8;

        // --- SECTION 2 : COMPARATIF DES CAISSIÈRES ---
        if (reportData.cashiersActivity && reportData.cashiersActivity.length > 0) {
            if (currentY > 230) { doc.addPage(); currentY = 15; }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
            doc.text("2. Comparatif Global des Caissières", 14, currentY);
            currentY += 4;

            const cashierCompareRows = reportData.cashiersActivity.map(c => [
                c.nom,
                c.totalTransactions,
                c.validTransactions,
                c.correctedTransactions,
                c.totalUnits,
                `${Number(c.totalRevenue || 0).toLocaleString('fr-FR')} FCFA`
            ]);

            doc.autoTable({
                startY: currentY,
                head: [['Nom de la Caissière', 'Total Trans.', 'Validées', 'Corrigées', 'Unités', 'CA Réel']],
                body: cashierCompareRows,
                theme: 'striped',
                headStyles: { fillColor: darkColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
                bodyStyles: { fontSize: 8, textColor: darkColor },
                margin: { left: 14, right: 14 }
            });

            currentY = doc.lastAutoTable.finalY + 8;

            // --- SECTION 3 : RAPPORTS INDIVIDUELS DÉTAILLÉS PAR CAISSIÈRE ---
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
            doc.text("3. Activité Détaillée par Caissière", 14, currentY);
            currentY += 4;

            reportData.cashiersActivity.forEach(cashier => {
                if (currentY > 220) { doc.addPage(); currentY = 15; }

                // En-tête de la caissière
                doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
                doc.rect(14, currentY, 182, 8, 'F');
                doc.setFont("helvetica", "bold");
                doc.setFontSize(9);
                doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                doc.text(`Caissière : ${cashier.nom} (Transactions : ${cashier.validTransactions} | CA : ${Number(cashier.totalRevenue).toLocaleString('fr-FR')} FCFA)`, 18, currentY + 5.5);
                currentY += 10;

                if (cashier.productsList && cashier.productsList.length > 0) {
                    const productRows = cashier.productsList.map(p => [
                        p.nom,
                        p.qte,
                        `${Number(p.prixUnitaire || 0).toLocaleString('fr-FR')} FCFA`,
                        `${Number(p.total || 0).toLocaleString('fr-FR')} FCFA`
                    ]);

                    doc.autoTable({
                        startY: currentY,
                        head: [['Produit Vendu', 'Quantité', 'Prix Unitaire', 'Montant Total']],
                        body: productRows,
                        theme: 'grid',
                        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
                        bodyStyles: { fontSize: 8, textColor: darkColor },
                        margin: { left: 18, right: 14 }
                    });

                    currentY = doc.lastAutoTable.finalY + 6;
                } else {
                    doc.setFont("helvetica", "italic");
                    doc.setFontSize(8);
                    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
                    doc.text("Aucune vente enregistrée pour cette caissière.", 18, currentY);
                    currentY += 8;
                }
            });
        }

        // --- SECTION 4 : ALERTES DE STOCK ---
        if (currentY > 240) { doc.addPage(); currentY = 15; }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text("4. Observations & Alertes de Stock", 14, currentY);
        currentY += 5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        const lowStockText = reportData.lowStockProducts && reportData.lowStockProducts.length > 0
            ? `Produits en stock critique (<= 5 unités) : ${reportData.lowStockProducts.join(', ')}`
            : "Aucun produit en stock critique actuellement.";
        doc.text(lowStockText, 14, currentY, { maxWidth: 182 });

        // --- PIED DE PAGE ---
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFont("helvetica", "italic");
            doc.setFontSize(7.5);
            doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
            doc.text("GABOIL — Document confidentiel réservé à la gestion interne de la station.", 14, 290);
            doc.text(`Page ${i} / ${pageCount}`, 195, 290, { align: 'right' });
        }

        doc.save(filename);
        await logArchiveMetadata(filename, "PDF_COMPLET");
    } catch (e) { console.error("Erreur génération PDF :", e); }
}

async function logArchiveMetadata(filename, formatType) {
    try {
        await addDoc(collection(db, "archives_metadata"), {
            nomFichier: filename,
            format: formatType,
            date: serverTimestamp()
        });
    } catch (err) { console.error("Erreur log archive :", err); }
}