/**
 * ARCHITECTURE LOCALE INDEXEDDB (via Dexie.js)
 * Conforme à la section 2.2 du cahier des charges
 */

// Initialisation de la base IndexedDB "PrepaConcoursDB"
const db = new Dexie('PrepaConcoursDB');

// Définition des schémas des 6 tables
db.version(1).stores({
  // 1. Catalogue complet des questions (stockées en Base64)
  questions: 'id, matiere, categorie',

  // 2. Historique des résultats de l'étudiant
  exam_sessions: '++id, local_session_id, mode, matiere, date_passage',

  // 3. File d'attente pour la synchronisation Cloud (Supabase)
  sync_queue: '++id, type, timestamp',

  // 4. Sauvegarde instantanée d'un quiz en cours (anti-perte si fermeture)
  quiz_en_cours: 'id',

  // 5. Statistiques de répétition espacée (Leitner) par question
  stats_par_question: 'id, vues, echecs, succes, derniere_reponse',

  // 6. Signalements d'erreurs faits par l'étudiant
  questions_signalees: '++id, question_id, date_signalement'
});

/**
 * Charge les questions de production (Base64) dans Dexie.js au premier lancement
 */
async function initialiserCatalogueQuestions() {
  const nombreQuestions = await db.questions.count();

  if (nombreQuestions > 0 && !navigator.onLine) {
    console.log(`⚡ Base locale prête : ${nombreQuestions} questions disponibles hors-ligne.`);
    return;
  }

  try {
    console.log(nombreQuestions === 0
      ? "📥 Premier lancement : chargement du catalogue de questions..."
      : "🔄 Vérification des mises à jour du catalogue...");
    const reponse = await fetch('questions_prod.json', { cache: 'no-cache' });
    if (!reponse.ok) {
      throw new Error(`HTTP ${reponse.status} lors du chargement du catalogue`);
    }
    const questions = await reponse.json();
    if (!Array.isArray(questions) || questions.some(q => !q || typeof q.id !== 'string')) {
      throw new Error("Le catalogue reçu n'est pas une liste de questions valide");
    }

    await db.questions.bulkPut(questions);
    console.log(`✅ ${questions.length} question(s) disponibles dans Dexie.js.`);
  } catch (erreur) {
    if (nombreQuestions === 0) {
      console.error("❌ Impossible de charger le catalogue :", erreur);
    } else {
      console.warn("⚠️ Mise à jour du catalogue indisponible, utilisation du cache local :", erreur);
    }
  }
}