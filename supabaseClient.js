/**
 * CLIENT DE CONNEXION SUPABASE (CLOUD DUC CONCOURS)
 */

const SUPABASE_URL = "https://mgcuxlioeubboannudzk.supabase.co";
// Vérifiez que votre longue clé qui commence par eyJ... est bien collée ci-dessous :
const SUPABASE_ANON_KEY = "sb_publishable_u2NEknzW3HuhZrcXHWvHJg_enGqlELh"; // La longue clé qui commence par ey...

if (window.supabase && typeof window.supabase.createClient === "function") {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
  console.log("☁️ Client Supabase DUC CONCOURS prêt et connecté !");
} else {
  window.supabaseClient = null;
  console.error("❌ Bibliothèque Supabase indisponible : l'application reste utilisable hors-ligne.");
}