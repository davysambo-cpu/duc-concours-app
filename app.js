/**
 * APP.JS - DUC CONCOURS
 */

if (window.__ducConcoursAppChargee) {
  console.warn("DUC CONCOURS : app.js déjà chargé, seconde exécution ignorée.");
} else {
window.__ducConcoursAppChargee = true;

const supabase = window.supabaseClient;
if (!supabase) {
  console.error("❌ Client Supabase indisponible : vérifiez le chargement de supabaseClient.js.");
}

let utilisateurActuel = null;
let utilisateurEstAdmin = false;

let sessionActuelle = {
  mode: null,
  matiere: null,
  questions: [],
  indexActuel: 0,
  reponsesUtilisateur: {},
  score: 0,
  tempsRestant: 0,
  timerInterval: null,
  estEntrainement: false
};

// DOM Éléments
const elDashboard = document.getElementById('ecran-dashboard');
const elQuiz = document.getElementById('ecran-quiz');
const elBilan = document.getElementById('ecran-bilan');
const elAdmin = document.getElementById('ecran-admin');

const elBadgeReseau = document.getElementById('badge-reseau');
const elTexteStatut = document.getElementById('texte-statut');
const elAlerteReprise = document.getElementById('alerte-reprise');

const elChronoBadge = document.getElementById('chrono-container');
const elChronoTemps = document.getElementById('chrono-temps');
const elCompteur = document.getElementById('compteur-questions');
const elBarreRemplissage = document.getElementById('barre-progression-remplissage');

const elBadgeMatiere = document.getElementById('badge-matiere');
const elBadgeType = document.getElementById('badge-type-reponse');
const elTexteQuestion = document.getElementById('texte-question');
const elListeOptions = document.getElementById('liste-options');
const elBlocExplication = document.getElementById('bloc-explication-directe');
const elTexteExplication = document.getElementById('texte-explication-directe');
const elBtnAction = document.getElementById('btn-action-quiz');
const elBtnSignaler = document.getElementById('btn-signaler-menu');
const elBtnOuvrirConnexion = document.getElementById('btn-ouvrir-connexion');
const elBtnDeconnexion = document.getElementById('btn-deconnexion');
const elBtnOuvrirAdmin = document.getElementById('btn-ouvrir-admin');
const elMenuActions = document.getElementById('menu-actions');
const elBtnMenuActions = document.getElementById('btn-menu-actions');
const elModalSignalement = document.getElementById('modal-signalement');
const elFormSignalement = document.getElementById('form-signalement');
const elSignalementCommentaire = document.getElementById('signalement-commentaire');
const elBtnAnnulerSignalement = document.getElementById('btn-annuler-signalement');
const elBtnEnvoyerSignalement = document.getElementById('btn-envoyer-signalement');

// Modale Auth
const elModalAuth = document.getElementById('modal-auth');
const elFormAuth = document.getElementById('form-auth');
const elAuthTitre = document.getElementById('auth-titre');
const elGroupeNom = document.getElementById('groupe-nom-complet');
const elAuthNom = document.getElementById('auth-nom');
const elAuthEmail = document.getElementById('auth-email');
const elAuthMdp = document.getElementById('auth-mdp');
const elAuthErreur = document.getElementById('auth-erreur');
const elBtnSoumettreAuth = document.getElementById('btn-soumettre-auth');
const elAuthLienBascule = document.getElementById('auth-lien-bascule');
const elAuthTexteBascule = document.getElementById('auth-texte-bascule');

let modeInscription = false;

// ========================================================
// 1. DÉCODAGE BASE64 SÉCURISÉ (Section 2.5)
// ========================================================
function decoderBase64Texte(base64Str) {
  try {
    return decodeURIComponent(escape(atob(base64Str)));
  } catch (e) {
    try { return atob(base64Str); } catch (err) { return base64Str; }
  }
}

function decoderBase64Reponses(base64Str) {
  try { return JSON.parse(atob(base64Str)); } catch (e) { return []; }
}

// ========================================================
// 2. PROTOCOLE AUTO-SYNC SUPABASE (Section 3.5 & 3.6)
// ========================================================
async function synchroniserDonnees() {
  if (!navigator.onLine || !utilisateurActuel || !supabase) {
    mettreAJourStatutReseau();
    return;
  }

  try {
    const queue = await db.sync_queue.toArray();
    const reports = await db.questions_signalees.toArray();

    if (queue.length === 0 && reports.length === 0) {
      mettreAJourStatutReseau();
      return;
    }

    console.log(`☁️ Auto-Sync : ${queue.length} session(s) et ${reports.length} signalement(s) à synchroniser...`);

    // 1. Envoi des sessions vers Supabase exam_sessions
    for (const item of queue) {
      if (item.type === 'SESSION') {
        const s = item.donnees;
        const { error } = await supabase.from('exam_sessions').upsert({
          user_id: utilisateurActuel.id,
          local_session_id: s.local_session_id,
          mode: s.mode,
          matiere: s.matiere,
          score_total: s.score_total,
          total_questions: s.total_questions,
          duree_secondes: s.duree_secondes,
          date_passage: s.date_passage
        }, { onConflict: 'user_id,local_session_id', ignoreDuplicates: true });

        if (!error) {
          await db.sync_queue.delete(item.id);
        } else {
          console.error("Erreur sync session :", error);
        }
      }
    }

    // 2. Envoi des signalements vers Supabase question_reports
    for (const r of reports) {
      const { error } = await supabase.from('question_reports').insert({
        user_id: utilisateurActuel.id,
        question_id: r.question_id,
        commentaire: r.commentaire,
        date_signalement: r.date_signalement
      });

      if (!error) {
        await db.questions_signalees.delete(r.id);
      } else {
        console.error("Erreur sync report :", error);
      }
    }

    console.log("✅ Auto-Sync terminée avec succès !");
    mettreAJourStatutReseau();
  } catch (err) {
    console.error("❌ Échec Auto-Sync :", err);
    mettreAJourStatutReseau(true);
  }
}

async function mettreAJourStatutReseau(erreur = false) {
  let fileAttente = 0;
  try {
    const [sessionsEnAttente, signalementsEnAttente] = await Promise.all([
      db.sync_queue.count(),
      db.questions_signalees.count()
    ]);
    fileAttente = sessionsEnAttente + signalementsEnAttente;
  } catch (err) {
    console.error("❌ Impossible de lire la file de synchronisation :", err);
    erreur = true;
  }

  if (erreur) {
    elBadgeReseau.className = 'badge-statut statut-rouge';
    elTexteStatut.textContent = 'Erreur Sync';
  } else if (!navigator.onLine) {
    elBadgeReseau.className = 'badge-statut statut-jaune';
    elTexteStatut.textContent = 'Hors-ligne';
  } else if (fileAttente > 0) {
    elBadgeReseau.className = 'badge-statut statut-jaune';
    elTexteStatut.textContent = 'Sync en attente';
  } else {
    elBadgeReseau.className = 'badge-statut statut-vert';
    elTexteStatut.textContent = 'En ligne';
  }
}

window.addEventListener('online', () => {
  mettreAJourStatutReseau();
  synchroniserDonnees();
});
window.addEventListener('offline', () => mettreAJourStatutReseau());

// ========================================================
// 3. AUTHENTIFICATION SUPABASE (Section 3.4)
// ========================================================
async function verifierAutorisationCloud(user) {
  if (!navigator.onLine || !supabase) return true;

  const { data: profil, error } = await supabase
    .from('profiles')
    .select('nom_complet, est_autorise, role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!profil) throw new Error("Profil utilisateur introuvable dans Supabase.");
  if (!profil.est_autorise) {
    throw new Error("Votre compte doit être autorisé par l'administration.");
  }

  utilisateurEstAdmin = profil.role === 'admin';
  elBtnOuvrirAdmin.classList.toggle('cache', !utilisateurEstAdmin);
  const nom = profil.nom_complet || user.user_metadata?.nom_complet || "Candidat";
  document.querySelector('.banniere-bienvenue h1').textContent = `Bienvenue, ${nom} ! 👋`;
  return true;
}

async function verifierSessionUtilisateur() {
  if (!supabase) {
    elModalAuth.classList.add('cache');
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();

  if (session && session.user) {
    try {
      await verifierAutorisationCloud(session.user);
      utilisateurActuel = session.user;
      elModalAuth.classList.add('cache');
      elBtnOuvrirConnexion.classList.add('cache');
      elMenuActions.classList.remove('cache');
      elBtnDeconnexion.classList.remove('cache');
      synchroniserDonnees();
    } catch (err) {
      console.error("❌ Session refusée :", err);
      utilisateurActuel = null;
      utilisateurEstAdmin = false;
      elBtnOuvrirAdmin.classList.add('cache');
      await supabase.auth.signOut();
      elBtnOuvrirConnexion.classList.remove('cache');
      elMenuActions.classList.add('cache');
      elBtnDeconnexion.classList.add('cache');
      elModalAuth.classList.remove('cache');
      elAuthErreur.textContent = err.message || "Compte non autorisé.";
      elAuthErreur.classList.remove('cache');
    }
  } else if (navigator.onLine) {
    elModalAuth.classList.remove('cache');
    elBtnOuvrirConnexion.classList.remove('cache');
    elMenuActions.classList.add('cache');
    elBtnDeconnexion.classList.add('cache');
  } else {
    elModalAuth.classList.add('cache');
    elBtnDeconnexion.classList.add('cache');
  }
}

// Soumission du formulaire d'authentification
elFormAuth.addEventListener('submit', async (e) => {
  e.preventDefault();
  elAuthErreur.classList.add('cache');
  elAuthErreur.classList.remove('auth-succes');
  elBtnSoumettreAuth.disabled = true;

  const email = elAuthEmail.value.trim();
  const password = elAuthMdp.value;
  const nom = elAuthNom.value.trim();

  try {
    const modeInscription = elAuthTitre.textContent === 'Inscription Candidat';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Saisissez une adresse email valide, par exemple nom@domaine.com.");
    }
    if (password.length < 6) {
      throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
    }
    if (modeInscription && !nom) {
      throw new Error("Saisissez votre nom et prénom.");
    }
    if (modeInscription) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { nom_complet: nom || "Candidat 2027" }
        }
      });
      if (error) throw error;
      if (!data.user) {
        throw new Error("Supabase n'a pas confirmé la création du compte.");
      }
      if (!data.session) {
        elAuthErreur.classList.add('auth-succes');
        elAuthErreur.textContent = "Compte créé. Consultez votre email pour confirmer l'inscription, puis connectez-vous.";
        elAuthErreur.classList.remove('cache');
        return;
      }
      utilisateurActuel = data.user;
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      utilisateurActuel = data.user;
    }

    await verifierAutorisationCloud(utilisateurActuel);
    elModalAuth.classList.add('cache');
    elBtnOuvrirConnexion.classList.add('cache');
    elMenuActions.classList.remove('cache');
    elBtnDeconnexion.classList.remove('cache');
    const prenom = utilisateurActuel.user_metadata?.nom_complet || "Candidat";
    document.querySelector('.banniere-bienvenue h1').textContent = `Bienvenue, ${prenom} ! 👋`;
    synchroniserDonnees();
  } catch (err) {
    elModalAuth.classList.remove('cache');
    elAuthErreur.classList.remove('auth-succes');
    elAuthErreur.textContent = err.message || "Erreur de connexion.";
    elAuthErreur.classList.remove('cache');
  } finally {
    elBtnSoumettreAuth.disabled = false;
  }
});

// Déconnexion
elBtnDeconnexion.addEventListener('click', async () => {
  if (confirm("Voulez-vous vous déconnecter ?")) {
    await supabase.auth.signOut();
    utilisateurActuel = null;
    utilisateurEstAdmin = false;
    elBtnOuvrirAdmin.classList.add('cache');
    elBtnOuvrirConnexion.classList.remove('cache');
    elMenuActions.classList.add('cache');
    elBtnDeconnexion.classList.add('cache');
    elModalAuth.classList.remove('cache');
  }
});

// ========================================================
// 4. GESTION DES ÉCRANS & QUIZ ENGINE
// ========================================================
function afficherEcran(nomEcran) {
  [elDashboard, elQuiz, elBilan, elAdmin].forEach(e => {
    if (e) {
      e.classList.remove('actif');
      e.classList.remove('cache');
    }
  });

  if (nomEcran === 'dashboard') {
    elDashboard.classList.add('actif');
    mettreAJourDashboard();
  } else if (nomEcran === 'quiz') {
    elQuiz.classList.add('actif');
  } else if (nomEcran === 'bilan') {
    elBilan.classList.add('actif');
  } else if (nomEcran === 'admin') {
    if (!utilisateurEstAdmin) {
      console.error("Accès administrateur refusé.");
      afficherEcran('dashboard');
      return;
    }
    elAdmin.classList.add('actif');
    chargerEspaceAdmin();
  }
  window.scrollTo(0, 0);
}

async function chargerEspaceAdmin() {
  if (!supabase || !utilisateurEstAdmin) return;

  const [profils, sessions, signalements] = await Promise.all([
    supabase.from('profiles').select('id, email, nom_complet, est_autorise, date_inscription').order('date_inscription', { ascending: false }),
    supabase.from('exam_sessions').select('user_id, score_total, total_questions, date_passage'),
    supabase.from('question_reports').select('id, question_id, commentaire, statut, date_signalement').order('date_signalement', { ascending: false }).limit(50)
  ]);
  const erreur = profils.error || sessions.error || signalements.error;
  if (erreur) {
    console.error("Erreur de chargement de l'espace admin :", erreur);
    const conteneur = document.getElementById('admin-liste-signalements');
    conteneur.textContent = `Impossible de charger les données administrateur : ${erreur.message || 'erreur inconnue'}`;
    return;
  }

  document.getElementById('admin-stat-etudiants').textContent =
    profils.data.filter(profil => profil.est_autorise).length;
  document.getElementById('admin-stat-signalements').textContent =
    signalements.data.filter(report => report.statut === 'nouveau').length;
  document.getElementById('admin-stat-sessions').textContent = sessions.data.length;

  const conteneurEtudiants = document.getElementById('admin-liste-etudiants');
  conteneurEtudiants.textContent = '';
  const sessionsParUtilisateur = new Map();
  sessions.data.forEach(session => {
    const liste = sessionsParUtilisateur.get(session.user_id) || [];
    liste.push(session);
    sessionsParUtilisateur.set(session.user_id, liste);
  });

  profils.data.filter(profil => profil.est_autorise).forEach(profil => {
    const sessionsUtilisateur = sessionsParUtilisateur.get(profil.id) || [];
    const moyenne = sessionsUtilisateur.length === 0
      ? 'Aucun résultat'
      : `${Math.round(sessionsUtilisateur.reduce((total, session) =>
        total + (session.score_total / session.total_questions) * 100, 0) / sessionsUtilisateur.length)} % de moyenne`;
    const carte = document.createElement('div');
    carte.className = 'item-correction';
    const nom = document.createElement('strong');
    nom.textContent = profil.nom_complet || profil.email;
    const details = document.createElement('p');
    details.textContent = `${profil.email} — ${sessionsUtilisateur.length} session(s) — ${moyenne}`;
    carte.append(nom, details);
    conteneurEtudiants.appendChild(carte);
  });
  if (conteneurEtudiants.childElementCount === 0) {
    conteneurEtudiants.textContent = 'Aucun étudiant autorisé.';
  }

  const conteneur = document.getElementById('admin-liste-signalements');
  conteneur.textContent = '';
  if (signalements.data.length === 0) {
    conteneur.textContent = 'Aucun signalement.';
    return;
  }

  signalements.data.forEach(report => {
    const carte = document.createElement('div');
    carte.className = 'item-correction';
    const titre = document.createElement('strong');
    titre.textContent = `${report.question_id} — ${report.statut}`;
    const commentaire = document.createElement('p');
    commentaire.textContent = report.commentaire || 'Aucun commentaire.';
    const bouton = document.createElement('button');
    bouton.className = 'btn btn-primaire';
    bouton.textContent = report.statut === 'nouveau' ? 'Marquer corrigé' : 'Déjà traité';
    bouton.disabled = report.statut !== 'nouveau';
    bouton.addEventListener('click', async () => {
      bouton.disabled = true;
      const { error } = await supabase
        .from('question_reports')
        .update({ statut: 'corrige' })
        .eq('id', report.id);
      if (error) {
        bouton.disabled = false;
        console.error("Erreur de mise à jour du signalement :", error);
        alert("Impossible de mettre à jour ce signalement.");
        return;
      }
      report.statut = 'corrige';
      titre.textContent = `${report.question_id} — corrige`;
      bouton.textContent = 'Déjà traité';
    });
    carte.append(titre, commentaire, bouton);
    conteneur.appendChild(carte);
  });
}

async function mettreAJourDashboard() {
  try {
    const sessions = await db.exam_sessions.toArray();
    const nbSessions = sessions.length;
    document.getElementById('stat-quiz-termines').textContent = nbSessions;

    if (nbSessions > 0) {
      const moyenne = sessions.reduce((acc, s) => acc + (s.score_total / s.total_questions), 0) / nbSessions;
      document.getElementById('stat-taux-reussite').textContent = `${Math.round(moyenne * 100)}%`;
    } else {
      document.getElementById('stat-taux-reussite').textContent = '-- %';
    }

    const quizEnCours = await db.quiz_en_cours.get('session_active');
    if (quizEnCours) {
      elAlerteReprise.classList.remove('cache');
    } else {
      elAlerteReprise.classList.add('cache');
    }

    const questionsToutes = await db.questions.toArray();
    const listeMatieres = [...new Set(questionsToutes.map(q => q.matiere))];
    const selectMatiere = document.getElementById('select-matiere-libre');
    if (listeMatieres.length > 0) {
      selectMatiere.innerHTML = '<option value="toutes">Toutes les matières</option>';
      listeMatieres.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m.charAt(0).toUpperCase() + m.slice(1);
        selectMatiere.appendChild(opt);
      });
    }
  } catch (e) {
    console.error("Erreur Dashboard :", e);
  }
}

async function selectionnerQuestions({ matiere, quantite, utiliserLeitner }) {
  let catalogue = await db.questions.toArray();

  if (matiere && matiere !== 'toutes') {
    catalogue = catalogue.filter(q => q.matiere.toLowerCase() === matiere.toLowerCase());
  }

  if (utiliserLeitner) {
    const stats = await db.stats_par_question.toArray();
    const statsMap = new Map(stats.map(s => [s.id, s]));

    catalogue.sort((a, b) => {
      const statA = statsMap.get(a.id) || { vues: 0, echecs: 0 };
      const statB = statsMap.get(b.id) || { vues: 0, echecs: 0 };
      if (statA.vues === 0 && statB.vues > 0) return -1;
      if (statB.vues === 0 && statA.vues > 0) return 1;
      const ratioA = statA.vues > 0 ? statA.echecs / statA.vues : 0;
      const ratioB = statB.vues > 0 ? statB.echecs / statB.vues : 0;
      return ratioB - ratioA;
    });
  } else {
    for (let i = catalogue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [catalogue[i], catalogue[j]] = [catalogue[j], catalogue[i]];
    }
  }

  if (quantite === 'all' || quantite >= catalogue.length) return catalogue;
  return catalogue.slice(0, quantite);
}

function melangerQuestions(questions) {
  const resultat = [...questions];
  for (let i = resultat.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [resultat[i], resultat[j]] = [resultat[j], resultat[i]];
  }
  return resultat;
}

async function selectionnerQuestionsStandard() {
  const catalogue = await db.questions.toArray();
  const specialite = melangerQuestions(catalogue.filter(q => q.categorie === 'specialite'));
  const cultureGenerale = melangerQuestions(catalogue.filter(q => q.categorie === 'culture_generale'));

  if (specialite.length < 40 || cultureGenerale.length < 20) {
    throw new Error(`Catalogue insuffisant : ${specialite.length} question(s) de spécialité et ${cultureGenerale.length} de culture générale disponibles.`);
  }
  return [...specialite.slice(0, 40), ...cultureGenerale.slice(0, 20)];
}

async function demarrerQuiz(configuration) {
  const { mode, matiere, quantite, dureeMinutes, estEntrainement, utiliserLeitner } = configuration;

  let questionsSelectionnees;
  try {
    questionsSelectionnees = mode === 'standard'
      ? await selectionnerQuestionsStandard()
      : await selectionnerQuestions({ matiere, quantite, utiliserLeitner });
  } catch (err) {
    console.error("Erreur de sélection du quiz :", err);
    alert(err.message || "Impossible de préparer ce quiz.");
    return;
  }
  if (questionsSelectionnees.length === 0) {
    alert("Aucune question disponible.");
    return;
  }

  sessionActuelle = {
    mode,
    matiere: matiere || 'Mixte',
    questions: questionsSelectionnees,
    indexActuel: 0,
    reponsesUtilisateur: {},
    score: 0,
    tempsRestant: dureeMinutes ? dureeMinutes * 60 : null,
    timerInterval: null,
    estEntrainement
  };

  if (sessionActuelle.tempsRestant !== null) {
    elChronoBadge.classList.remove('cache');
    lancerChrono();
  } else {
    elChronoBadge.classList.add('cache');
  }

  afficherEcran('quiz');
  sauvegarderProgressionLocale();
  afficherQuestionCourante();
}

function lancerChrono() {
  clearInterval(sessionActuelle.timerInterval);
  mettreAJourAffichageChrono();

  sessionActuelle.timerInterval = setInterval(() => {
    sessionActuelle.tempsRestant--;
    mettreAJourAffichageChrono();

    if (sessionActuelle.tempsRestant <= 0) {
      clearInterval(sessionActuelle.timerInterval);
      alert("⏱️ Temps écoulé !");
      terminerSession();
    } else if (sessionActuelle.tempsRestant % 5 === 0) {
      sauvegarderProgressionLocale();
    }
  }, 1000);
}

function mettreAJourAffichageChrono() {
  const m = Math.floor(sessionActuelle.tempsRestant / 60);
  const s = sessionActuelle.tempsRestant % 60;
  elChronoTemps.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function sauvegarderProgressionLocale() {
  if (!sessionActuelle.estEntrainement) {
    await db.quiz_en_cours.put({
      id: 'session_active',
      session: {
        mode: sessionActuelle.mode,
        matiere: sessionActuelle.matiere,
        questions: sessionActuelle.questions,
        indexActuel: sessionActuelle.indexActuel,
        reponsesUtilisateur: sessionActuelle.reponsesUtilisateur,
        score: sessionActuelle.score,
        tempsRestant: sessionActuelle.tempsRestant
      }
    });
  }
}

function afficherQuestionCourante() {
  const total = sessionActuelle.questions.length;
  const index = sessionActuelle.indexActuel;
  const q = sessionActuelle.questions[index];

  elCompteur.textContent = `Question ${index + 1} / ${total}`;
  const pct = ((index + 1) / total) * 100;
  elBarreRemplissage.style.width = `${pct}%`;

  elBadgeMatiere.textContent = (q.matiere || 'Quiz').toUpperCase();
  elBadgeType.textContent = q.type === 'multiple' ? 'Choix multiples' : 'Choix unique';
  elTexteQuestion.textContent = q.question;

  elListeOptions.innerHTML = '';
  elBlocExplication.classList.add('cache');
  elBtnSignaler.disabled = false;
  elBtnSignaler.textContent = '🚩 Signaler une erreur';
  elBtnAction.disabled = true;
  elBtnAction.textContent = 'Valider la réponse';

  const choixFaits = sessionActuelle.reponsesUtilisateur[index] || [];

  q.options.forEach((optTexte, idx) => {
    const optDiv = document.createElement('div');
    optDiv.className = 'option-item';
    optDiv.dataset.index = idx;

    const lettre = String.fromCharCode(65 + idx);
    const lettreElement = document.createElement('strong');
    lettreElement.textContent = `${lettre}.`;
    const texteElement = document.createElement('span');
    texteElement.textContent = optTexte;
    optDiv.append(lettreElement, document.createTextNode(' '), texteElement);

    if (choixFaits.includes(idx)) {
      optDiv.classList.add('selectionne');
    }

    optDiv.addEventListener('click', () => gererClicOption(idx, q.type));
    elListeOptions.appendChild(optDiv);
  });

  if (choixFaits.length > 0) {
    elBtnAction.disabled = false;
  }
}

function gererClicOption(indexOption, typeQuestion) {
  if (sessionActuelle.estEntrainement && !elBlocExplication.classList.contains('cache')) return;

  const index = sessionActuelle.indexActuel;
  if (!sessionActuelle.reponsesUtilisateur[index]) sessionActuelle.reponsesUtilisateur[index] = [];

  let choix = sessionActuelle.reponsesUtilisateur[index];

  if (typeQuestion === 'single') {
    choix = [indexOption];
  } else {
    const pos = choix.indexOf(indexOption);
    if (pos > -1) choix.splice(pos, 1);
    else choix.push(indexOption);
  }

  sessionActuelle.reponsesUtilisateur[index] = choix;

  document.querySelectorAll('.option-item').forEach(el => {
    const idx = parseInt(el.dataset.index);
    if (choix.includes(idx)) el.classList.add('selectionne');
    else el.classList.remove('selectionne');
  });

  elBtnAction.disabled = choix.length === 0;
}

elBtnAction.addEventListener('click', async () => {
  const index = sessionActuelle.indexActuel;
  const q = sessionActuelle.questions[index];
  const choixUtilisateur = sessionActuelle.reponsesUtilisateur[index] || [];
  const bonnesReponses = decoderBase64Reponses(q.reponses_correctes);

  let estCorrect = false;
  if (q.type === 'single') {
    estCorrect = choixUtilisateur.length === 1 && bonnesReponses.includes(choixUtilisateur[0]);
  } else {
    estCorrect = choixUtilisateur.length === bonnesReponses.length &&
                 choixUtilisateur.every(val => bonnesReponses.includes(val));
  }

  if (sessionActuelle.estEntrainement) {
    if (elBtnAction.textContent === 'Valider la réponse') {
      document.querySelectorAll('.option-item').forEach(el => {
        const idx = parseInt(el.dataset.index);
        if (bonnesReponses.includes(idx)) el.classList.add('correcte');
        else if (choixUtilisateur.includes(idx)) el.classList.add('incorrecte');
      });

      elTexteExplication.textContent = decoderBase64Texte(q.explication);
      elBlocExplication.classList.remove('cache');

      await actualiserStatsQuestion(q.id, estCorrect);
      elBtnAction.textContent = (index + 1 < sessionActuelle.questions.length) ? 'Question suivante' : 'Voir le bilan';
      return;
    }
  }

  if (sessionActuelle.indexActuel + 1 < sessionActuelle.questions.length) {
    sessionActuelle.indexActuel++;
    sauvegarderProgressionLocale();
    afficherQuestionCourante();
  } else {
    terminerSession();
  }
});

elBtnSignaler.addEventListener('click', async () => {
  const q = sessionActuelle.questions[sessionActuelle.indexActuel];
  if (!q) return;

  elSignalementCommentaire.value = '';
  elModalSignalement.classList.remove('cache');
  window.setTimeout(() => elSignalementCommentaire.focus(), 0);
});

function fermerModalSignalement() {
  elModalSignalement.classList.add('cache');
  elFormSignalement.reset();
}

elBtnAnnulerSignalement.addEventListener('click', fermerModalSignalement);
elModalSignalement.addEventListener('click', (event) => {
  if (event.target === elModalSignalement) fermerModalSignalement();
});
elFormSignalement.addEventListener('submit', async (event) => {
  event.preventDefault();
  const q = sessionActuelle.questions[sessionActuelle.indexActuel];
  if (!q) {
    fermerModalSignalement();
    return;
  }

  elBtnEnvoyerSignalement.disabled = true;
  try {
    const dejaSignale = await db.questions_signalees
      .where('question_id')
      .equals(q.id)
      .first();
    if (dejaSignale) {
      elBtnSignaler.disabled = true;
      elBtnSignaler.textContent = "Erreur déjà signalée";
      fermerModalSignalement();
      return;
    }

    await db.questions_signalees.add({
      question_id: q.id,
      commentaire: elSignalementCommentaire.value.trim(),
      date_signalement: new Date().toISOString()
    });
    elBtnSignaler.disabled = true;
    elBtnSignaler.textContent = "Erreur signalée";
    fermerModalSignalement();
    mettreAJourStatutReseau();
    await synchroniserDonnees();
  } catch (error) {
    console.error("Erreur lors de l'enregistrement du signalement :", error);
    elBtnEnvoyerSignalement.disabled = false;
    alert("Impossible d'enregistrer le signalement. Réessayez.");
  }
});

async function actualiserStatsQuestion(questionId, reussite) {
  const stat = await db.stats_par_question.get(questionId) || {
    id: questionId,
    vues: 0,
    echecs: 0,
    succes: 0,
    derniere_reponse: null
  };

  stat.vues++;
  if (reussite) stat.succes++;
  else stat.echecs++;
  stat.derniere_reponse = new Date().toISOString();

  await db.stats_par_question.put(stat);
}

async function terminerSession() {
  clearInterval(sessionActuelle.timerInterval);

  let scoreTotal = 0;
  const totalQuestions = sessionActuelle.questions.length;

  for (let i = 0; i < totalQuestions; i++) {
    const q = sessionActuelle.questions[i];
    const choix = sessionActuelle.reponsesUtilisateur[i] || [];
    const bonnes = decoderBase64Reponses(q.reponses_correctes);

    let gagne = (q.type === 'single')
      ? (choix.length === 1 && bonnes.includes(choix[0]))
      : (choix.length === bonnes.length && choix.every(val => bonnes.includes(val)));

    if (gagne) scoreTotal++;
    if (!sessionActuelle.estEntrainement) await actualiserStatsQuestion(q.id, gagne);
  }

  sessionActuelle.score = scoreTotal;

  const sessionEnregistree = {
    local_session_id: 'sess_' + Date.now(),
    mode: sessionActuelle.mode,
    matiere: sessionActuelle.matiere,
    score_total: scoreTotal,
    total_questions: totalQuestions,
    duree_secondes: sessionActuelle.tempsRestant ? (sessionActuelle.questions.length * 60 - sessionActuelle.tempsRestant) : 0,
    date_passage: new Date().toISOString()
  };
  await db.exam_sessions.add(sessionEnregistree);

  // File d'attente Auto-Sync (Section 3.5)
  await db.sync_queue.add({
    type: 'SESSION',
    donnees: sessionEnregistree,
    timestamp: Date.now()
  });

  await db.quiz_en_cours.delete('session_active');

  document.getElementById('bilan-score-note').textContent = scoreTotal;
  document.getElementById('bilan-score-max').textContent = `/ ${totalQuestions}`;

  const ratio = scoreTotal / totalQuestions;
  const elMention = document.getElementById('bilan-mention');
  if (ratio >= 0.8) {
    elMention.textContent = "🏆 Excellent ! Vous êtes prêt pour le concours !";
    elMention.style.color = "var(--succes)";
  } else if (ratio >= 0.5) {
    elMention.textContent = "👍 Bon travail ! Encore quelques révisions.";
    elMention.style.color = "var(--primaire)";
  } else {
    elMention.textContent = "⚠️ Courage ! Révisez les questions signalées ci-dessous.";
    elMention.style.color = "var(--danger)";
  }

  genererFeuilleCorrection();
  afficherEcran('bilan');

  // Lancement silencieux de l'Auto-Sync en arrière-plan
  synchroniserDonnees();
}

function genererFeuilleCorrection() {
  const conteneur = document.getElementById('liste-accordions-correction');
  conteneur.innerHTML = '';

  sessionActuelle.questions.forEach((q, idx) => {
    const choix = sessionActuelle.reponsesUtilisateur[idx] || [];
    const bonnes = decoderBase64Reponses(q.reponses_correctes);
    const explication = decoderBase64Texte(q.explication);

    const estCorrect = (q.type === 'single')
      ? (choix.length === 1 && bonnes.includes(choix[0]))
      : (choix.length === bonnes.length && choix.every(val => bonnes.includes(val)));

    const item = document.createElement('div');
    item.className = 'item-correction';
    item.style.borderLeft = `5px solid ${estCorrect ? 'var(--succes)' : 'var(--danger)'}`;

    const bonnesLettres = bonnes.map(b => String.fromCharCode(65 + b)).join(', ');
    const vosLettres = choix.length > 0 ? choix.map(c => String.fromCharCode(65 + c)).join(', ') : 'Aucune';

    const titre = document.createElement('div');
    titre.style.cssText = 'font-weight: 700; margin-bottom: 6px;';
    titre.textContent = `Q${idx + 1}. ${q.question}`;

    const resultat = document.createElement('div');
    resultat.style.cssText = 'font-size: 0.9rem; margin-bottom: 4px;';
    resultat.append(
      document.createTextNode('Votre réponse : '),
      Object.assign(document.createElement('strong'), { textContent: vosLettres }),
      document.createTextNode(` ${estCorrect ? '✅' : '❌'} | Bonne réponse : `)
    );
    const bonnesElement = document.createElement('strong');
    bonnesElement.style.color = 'var(--succes)';
    bonnesElement.textContent = bonnesLettres;
    resultat.appendChild(bonnesElement);

    const explicationElement = document.createElement('div');
    explicationElement.style.cssText = 'font-size: 0.88rem; color: #475569; margin-top: 6px; background: #f8fafc; padding: 8px; border-radius: 6px;';
    explicationElement.append(document.createTextNode('💡 '), Object.assign(document.createElement('em'), { textContent: explication }));

    item.append(titre, resultat, explicationElement);
    conteneur.appendChild(item);
  });
}

// ========================================================
// 5. BOUTONS & DÉMARRAGE
// ========================================================
document.getElementById('btn-mode-standard').addEventListener('click', () => {
  demarrerQuiz({ mode: 'standard', quantite: 60, dureeMinutes: 60, estEntrainement: false, utiliserLeitner: false });
});

document.getElementById('btn-mode-unidisciplinaire').addEventListener('click', () => {
  const matiere = document.getElementById('select-matiere-libre').value;
  if (!matiere || matiere === 'toutes') {
    alert("Sélectionnez une matière avant de lancer le concours unidisciplinaire.");
    return;
  }
  demarrerQuiz({ mode: 'unidisciplinaire', matiere, quantite: 40, dureeMinutes: 40, estEntrainement: false, utiliserLeitner: false });
});

document.getElementById('btn-lancer-entrainement').addEventListener('click', () => {
  const mat = document.getElementById('select-matiere-libre').value;
  const qteVal = document.getElementById('select-nombre-libre').value;
  const qte = qteVal === 'all' ? 'all' : parseInt(qteVal);
  const leitner = document.getElementById('check-leitner').checked;

  demarrerQuiz({ mode: 'entrainement', matiere: mat, quantite: qte, dureeMinutes: null, estEntrainement: true, utiliserLeitner: leitner });
});

document.getElementById('btn-reprendre-quiz').addEventListener('click', async () => {
  const sauvegarde = await db.quiz_en_cours.get('session_active');
  if (sauvegarde && sauvegarde.session) {
    sessionActuelle = sauvegarde.session;
    sessionActuelle.timerInterval = null;

    if (sessionActuelle.tempsRestant !== null) {
      elChronoBadge.classList.remove('cache');
      lancerChrono();
    } else {
      elChronoBadge.classList.add('cache');
    }

    afficherEcran('quiz');
    afficherQuestionCourante();
  }
});

document.getElementById('btn-retour-dashboard').addEventListener('click', () => afficherEcran('dashboard'));
elBtnMenuActions.addEventListener('click', () => {
  const ouvert = elBtnMenuActions.getAttribute('aria-expanded') === 'true';
  elBtnMenuActions.setAttribute('aria-expanded', String(!ouvert));
  elMenuActions.classList.toggle('ouvert', !ouvert);
});
elMenuActions.addEventListener('click', (event) => {
  if (event.target.closest('.menu-action')) {
    elMenuActions.classList.remove('ouvert');
    elBtnMenuActions.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('click', (event) => {
  if (!elMenuActions.contains(event.target)) {
    elMenuActions.classList.remove('ouvert');
    elBtnMenuActions.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!elModalSignalement.classList.contains('cache')) {
      fermerModalSignalement();
      return;
    }
    elMenuActions.classList.remove('ouvert');
    elBtnMenuActions.setAttribute('aria-expanded', 'false');
  }
});
elBtnOuvrirAdmin.addEventListener('click', () => afficherEcran('admin'));
document.getElementById('btn-retour-dashboard-admin').addEventListener('click', () => afficherEcran('dashboard'));

// INITIALISATION AU DÉMARRAGE
window.addEventListener('DOMContentLoaded', async () => {
  mettreAJourStatutReseau();
  await initialiserCatalogueQuestions();
  await mettreAJourDashboard();
  await verifierSessionUtilisateur();
});
}