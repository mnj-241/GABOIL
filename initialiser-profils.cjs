
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

// Connexion au projet GABOIL
initializeApp({
    credential: applicationDefault(),
    projectId: "gaboil"
});

const auth = getAuth();
const db = getFirestore();

// Les trois comptes GABOIL
const comptes = [
    {
        email: "chefgaboil@gmail.com",
        nom: "Chef",
        role: "ADMIN"
    },
    {
        email: "caissiere1@gmail.com",
        nom: "Caissière 1",
        role: "CAISSIERE"
    },
    {
        email: "caissiere2@gmail.com",
        nom: "Caissière 2",
        role: "CAISSIERE"
    }
];

async function initialiserProfils() {
    for (const compte of comptes) {
        const utilisateur = await auth.getUserByEmail(compte.email);

        await db.collection("users")
            .doc(utilisateur.uid)
            .set({
                nom: compte.nom,
                role: compte.role,
                actif: true
            }, { merge: true });

        console.log(`Profil créé : ${compte.nom} (${compte.role})`);
    }

    console.log("Initialisation terminée !");
}

initialiserProfils()
    .then(() => process.exit(0))
    .catch(erreur => {
        console.error("Erreur :", erreur);
        process.exit(1);
    });
