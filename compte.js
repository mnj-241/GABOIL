import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "connexion.html"; return; }
    
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists() || !userSnap.data().actif) { window.location.href = "connexion.html"; return; }

    const data = userSnap.data();
    document.getElementById('sidebarUserName').textContent = data.nom || "Caissière";
    document.getElementById('profileName').textContent = data.nom || "N/A";
    document.getElementById('profileEmail').textContent = user.email || "N/A";
    document.getElementById('profileRole').textContent = data.role || "N/A";
    document.getElementById('profileStatus').textContent = data.actif ? "Actif (Autorisé)" : "Inactif";

    // Gestion de l'interrupteur de partage (uniquement pour les caissières)
    const shareToggle = document.getElementById('shareHistoryToggle');
    if (shareToggle) {
        if (data.role === "ADMIN") {
            shareToggle.closest('.card-section').style.display = 'none';
        } else {
            shareToggle.checked = data.partagerHistorique === true;

            shareToggle.addEventListener('change', async () => {
                try {
                    await updateDoc(userDocRef, {
                        partagerHistorique: shareToggle.checked
                    });
                    console.log("Préférence de partage mise à jour :", shareToggle.checked);
                } catch (err) {
                    console.error("Erreur lors de la mise à jour du partage :", err);
                    shareToggle.checked = !shareToggle.checked;
                }
            });
        }
    }

    document.getElementById('logoutAccountBtn').addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = "connexion.html";
        } catch (e) { console.error("Erreur déconnexion:", e); }
    });
});