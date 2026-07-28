/* Connexion à la base et identité de la personne connectée.

   La clé ci-dessous est PUBLIQUE par conception (« publishable ») : elle ne
   donne accès à rien sans compte, c'est la sécurité au niveau des lignes, côté
   base, qui protège. Ne jamais mettre ici la clé « service_role », qui
   contourne tout. */

const SB_URL = "https://fjhmzcvivomqyyyemvny.supabase.co";
const SB_KEY = "sb_publishable_X8_UhCVsZC0hd6QipbtnZA_FOECka0X";

export const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: {persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}
});

let session = null;   // session Supabase, null tant qu'on n'est pas connecté
let moi = null;       // ligne « profil » du compte connecté
let foyer = {};       // id -> prénom, pour afficher qui a fait quoi

export const getSession = () => session;
export const getMoi     = () => moi;
export const monId      = () => session ? session.user.id : null;
export const estAdulte  = () => !!moi && moi.role === "adulte";

/* Prénom d'un membre. Rend "" pour un identifiant inconnu ou absent, de sorte
   que l'affichage puisse simplement ne rien montrer. */
export const prenomDe = id => (id && foyer[id]) || "";

/* Les comptes, pour proposer une assignation. Triés par prénom pour que l'ordre
   des menus ne dépende pas de l'ordre de création des comptes. */
export const membres = () => Object.entries(foyer)
  .map(([id, prenom]) => ({id, prenom}))
  .sort((a, b) => a.prenom.localeCompare(b.prenom));

export async function sessionCourante(){
  const {data:{session:s}} = await sb.auth.getSession();
  return s;
}

export async function ouvrir(s){
  session = s || null;
  if(!session){ moi = null; return null; }
  /* l'adresse garde le jeton du lien de connexion : on la nettoie */
  if(location.hash.includes("access_token"))
    history.replaceState(null, "", location.pathname + location.search);
  /* Le foyer entier tient en quelques lignes : on le charge d'un coup plutôt
     que d'interroger la base à chaque prénom à afficher. */
  const {data} = await sb.from("profil").select("id, prenom, role");
  foyer = Object.fromEntries((data || []).map(p => [p.id, p.prenom]));
  moi = (data || []).find(p => p.id === session.user.id) || null;
  return moi;
}

/* Le prénom est déduit de l'adresse mail à la création du compte
   (« fabien.lenzini@… » donne « fabien.lenzini ») : chacun doit pouvoir
   corriger le sien, sinon il faut passer par la base à chaque nouveau compte.
   La règle d'accès ne laisse modifier que sa propre ligne. */
export async function changerPrenom(nouveau){
  const p = String(nouveau).trim();
  if(!p || !session) return {error:{message:"Prénom vide."}};
  const {error} = await sb.from("profil").update({prenom:p}).eq("id", session.user.id);
  if(!error){
    foyer[session.user.id] = p;
    if(moi) moi.prenom = p;
  }
  return {error};
}

/* Le mot de passe est le chemin normal, le lien reçu par mail n'est qu'un
   secours. La raison n'est pas le confort : un mot de passe se tape DANS
   l'appli, donc la session s'enregistre dans le stockage de l'appli. Le lien,
   lui, s'ouvre souvent ailleurs — le navigateur du logiciel de courrier, ou
   Safari alors que l'appli tourne depuis un raccourci de l'écran d'accueil, qui
   a son propre stockage. La connexion réussit, la session atterrit à côté, et
   l'appli reste déconnectée sans rien pouvoir en dire. */
export const connecter = (mail, mdp) =>
  sb.auth.signInWithPassword({email: String(mail).trim(), password: String(mdp)});

/* Personne ne connaît son mot de passe au départ : chacun pose le sien depuis
   Réglages → Compte, une fois entré par le lien. Même raison que pour le prénom
   — le faire à la main en base serait à refaire au compte suivant. */
export async function changerMotDePasse(nouveau){
  const mdp = String(nouveau);
  if(!session) return {error:{message:"Aucune session ouverte."}};
  if(mdp.length < 8) return {error:{message:"Huit caractères au moins."}};
  return sb.auth.updateUser({password: mdp});
}

export function fermer(){ session = null; moi = null; foyer = {}; }

export function surChangementDeSession(fn){
  sb.auth.onAuthStateChange((_ev, s) => fn(s));
}

export async function envoyerLien(mail){
  return sb.auth.signInWithOtp({
    email: mail,
    options: {emailRedirectTo: location.href.split("#")[0]}
  });
}

export const deconnecter = () => sb.auth.signOut();
