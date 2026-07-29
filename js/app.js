/* Démarrage de l'appli : câblage des modules, connexion, synchronisation.

   C'est le seul fichier qui connaisse tout le monde. Les modules, eux, ne se
   connaissent pas entre eux — ils passent par le bus de signaux. */

import {$, esc, showTab, brancherOnglets, demanderConfirmation} from "./noyau/ui.js";
import {brancherTheme} from "./noyau/theme.js";
import {store, deballer} from "./noyau/store.js";
import {sur, emettre} from "./noyau/signal.js";
import * as Auth from "./noyau/supabase.js";

import * as M from "./planning/modele.js";
import {creerSyncPlanning} from "./planning/donnees.js";
import {renderImporter, brancherImporter, initDateDebut} from "./planning/importer.js";
import {renderCodes} from "./planning/codes.js";
import {renderNext, renderPlanning, brancherPlanning} from "./planning/vue.js";
import {renderExport, setExportDefaults, brancherExport} from "./planning/export.js";

import * as C from "./courses/modele.js";
import {creerSyncCourses} from "./courses/donnees.js";
import {renderCourses, brancherCourses} from "./courses/vue.js";

import {creerSyncIdees, renderIdees, brancherIdees, remplacerIdees} from "./idees/idees.js";
import {creerSyncAgenda, renderAgenda, brancherAgenda, remplacerEvenements} from "./agenda/agenda.js";
import * as R from "./rappels/rappels.js";

/* ---------- affichage ---------- */
function renderAll(){
  renderImporter();
  renderCodes();
  renderNext();
  renderPlanning();
  setExportDefaults();
  renderExport();
  renderCourses();
  renderAgenda();
  R.renderRappels();
  renderIdees();
  majBadges();
}
sur("rendre", renderAll);

/* Pastilles de la barre du bas : ce qui réclame une action, visible depuis
   n'importe où. Courses = articles à prendre, Planning = codes sans horaire
   (ces jours-là ne sonneront pas, c'est ce qui mérite qu'on y retourne). */
function majBadges(){
  const paires = [
    ["coursesBadge",  C.articles(false).length],
    ["rappelsBadge",  R.enRetard()],
    ["planningBadge", M.pendingCodes().length]
  ];
  paires.forEach(([id, n]) => {
    const badge = $(id);
    badge.hidden = !n;
    badge.textContent = n || "";
  });
}

function setSyncStatus(txt, warn){
  const el = $("syncStatus");
  el.textContent = txt;
  /* la teinte d'avertissement vient des jetons : elle doit rester lisible en
     mode sombre, où un brun fixe se noierait dans le fond */
  el.style.color = warn ? "var(--attention)" : "";
}

/* ---------- synchronisation ---------- */
const sync = creerSyncPlanning({
  statut: setSyncStatus,
  apresLecture(purge){
    $("lead").value = M.prefs.lead;
    $("calName").value = M.prefs.calName;
    renderAll();
    /* la purge des jours trop anciens doit repartir vers la base */
    if(purge) sync.planifier();
  }
});

const syncCourses = creerSyncCourses({
  statut: setSyncStatus,
  apresLecture(){ renderAll(); }
});

const syncIdees = creerSyncIdees({
  statut: setSyncStatus,
  apresLecture(){ renderAll(); }
});

const syncAgenda = creerSyncAgenda({
  statut: setSyncStatus,
  apresLecture(){ renderAll(); }
});

const syncRappels = R.creerSyncRappels({
  statut: setSyncStatus,
  apresLecture(){ renderAll(); }
});

const syncs = [sync, syncCourses, syncAgenda, syncRappels, syncIdees];

/* Un module ne signale pas lequel des jeux de données a bougé : on programme
   les trois. Celui qui n'a rien à envoyer s'arrête sans la moindre requête. */
sur("modifie", () => {
  if(!Auth.getSession()) return;
  syncs.forEach(s => s.planifier());
});

/* ---------- connexion ---------- */
function montrerEcrans(){
  const connecte = !!Auth.getSession();
  $("authEcran").hidden    = connecte;
  $("appEcran").hidden     = !connecte;
  $("barreOnglets").hidden = !connecte;
}

function renderSyncUI(){
  const moi = Auth.getMoi();
  $("syncInfo").innerHTML = moi
    ? `Connectée en tant que <strong>${esc(moi.prenom)}</strong>${moi.role === "enfant" ? " (lecture seule)" : ""}.`
    : "Non connectée.";
  $("syncCfg").hidden = !Auth.getSession();
  if(moi) $("monPrenom").value = moi.prenom;
}

async function ouvrirSession(s){
  await Auth.ouvrir(s);
  montrerEcrans();
  if(!Auth.getSession()) return;
  try{
    renderSyncUI();
    R.majPersonnes();   /* le foyer vient d'être chargé : le menu « Pour qui » peut se remplir */
    await Promise.all(syncs.map(s => s.maintenant(true)));
    syncs.forEach(s => s.ecouter());
  }catch(e){
    setSyncStatus("Connexion à la base impossible — l'appli fonctionne avec la copie de cet appareil.", true);
  }
}

/* Les messages de Supabase arrivent en anglais. Les deux qu'on voit vraiment
   méritent d'être dits en français ; le reste passe tel quel plutôt que d'être
   avalé. */
function enClair(m){
  const t = String(m || "");
  if(/invalid login credentials/i.test(t)) return "Adresse ou mot de passe incorrect.";
  if(/email not confirmed/i.test(t))       return "Cette adresse n'est pas encore confirmée.";
  if(/password should be at least/i.test(t)) return "Mot de passe trop court.";
  return t;
}

const direAuth = (txt, ok) =>
  $("authMsg").innerHTML = `<p class="msg ${ok ? "ok" : "warn"}">${esc(txt)}</p>`;

async function connexionMotDePasse(){
  const mail = $("authMail").value.trim(), mdp = $("authMdp").value;
  if(!mail || !mdp) return direAuth("Il faut l'adresse mail et le mot de passe.");
  $("authBtn").disabled = true;
  $("authMsg").innerHTML = "";
  const {error} = await Auth.connecter(mail, mdp);
  $("authBtn").disabled = false;
  if(error) return direAuth(enClair(error.message));
  /* pas d'appel à ouvrirSession ici : le changement de session s'en charge */
  $("authMdp").value = "";
}

async function connexionEnvoyer(){
  const mail = $("authMail").value.trim();
  if(!mail) return direAuth("Ton adresse mail d'abord.");
  $("authLienBtn").disabled = true;
  const {error} = await Auth.envoyerLien(mail);
  $("authLienBtn").disabled = false;
  if(error) return direAuth(enClair(error.message));
  direAuth(`Lien envoyé à ${mail}. Ouvre-le sur cet appareil, dans ce navigateur — `
    + "il ne sert qu'une fois. Pose ensuite ton mot de passe dans Réglages → Compte.", true);
}

/* Un lien déjà utilisé ou périmé revient avec son erreur dans l'adresse. Sans
   ce message, on retombe sur l'écran de connexion sans savoir pourquoi — et on
   reclique le même lien, qui échoue encore. Lu tout de suite au démarrage :
   la bibliothèque Supabase nettoie l'adresse de son côté. */
function erreurDansAdresse(){
  if(!location.hash.includes("error")) return null;
  const h = new URLSearchParams(location.hash.slice(1));
  const err = h.get("error_description") || h.get("error");
  if(err) history.replaceState(null, "", location.pathname + location.search);
  return err;
}

/* ---------- câblage ---------- */
brancherTheme();
brancherOnglets();
brancherImporter();
brancherPlanning();
brancherExport();
brancherCourses();
brancherAgenda();
R.brancherRappels();
brancherIdees();

$("authForm").addEventListener("submit", e => { e.preventDefault(); connexionMotDePasse(); });
$("authLienBtn").addEventListener("click", connexionEnvoyer);
$("syncNowBtn").addEventListener("click", () => sync.maintenant(true));
$("prenomSave").addEventListener("click", async () => {
  const {error} = await Auth.changerPrenom($("monPrenom").value);
  $("prenomMsg").innerHTML = error
    ? `<p class="msg warn">${esc(error.message)}</p>`
    : `<p class="msg ok">Prénom enregistré.</p>`;
  if(error) return;
  /* le prénom apparaît sur les rappels assignés et dans les menus : tout se refait */
  renderSyncUI();
  R.majPersonnes();
  renderAll();
});
$("monPrenom").addEventListener("keydown", e => {
  if(e.key === "Enter"){ e.preventDefault(); $("prenomSave").click(); }
});
$("mdpSave").addEventListener("click", async () => {
  const {error} = await Auth.changerMotDePasse($("monMdp").value);
  $("mdpMsg").innerHTML = error
    ? `<p class="msg warn">${esc(enClair(error.message))}</p>`
    : `<p class="msg ok">Mot de passe enregistré. C'est celui-là, avec ton adresse mail,
       sur chaque appareil.</p>`;
  if(!error) $("monMdp").value = "";
});
$("monMdp").addEventListener("keydown", e => {
  if(e.key === "Enter"){ e.preventDefault(); $("mdpSave").click(); }
});
$("deconnexion").addEventListener("click", async () => {
  if(!await demanderConfirmation("Se déconnecter de cet appareil ?",
    "Il faudra retaper ton adresse et ton mot de passe pour revenir.",
    {valider:"Se déconnecter", danger:true})) return;
  await Auth.deconnecter();
  location.reload();
});
$("lead").addEventListener("input", () => {
  M.prefs.lead = Math.max(0, parseInt($("lead").value) || 0);
  M.savePrefs(); renderNext(); renderPlanning();
});
$("calName").addEventListener("change", () => {
  M.prefs.calName = $("calName").value.trim() || "Travail";
  M.savePrefs();
});

/* ---------- démarrage ---------- */
(async () => {
  const erreurLien = erreurDansAdresse();   /* avant tout await : l'adresse se nettoie vite */

  /* Le cache local s'affiche tout de suite ; la base prend le relais dès que la
     session est connue. Un appareil déjà connecté ne revoit jamais l'écran de
     connexion, y compris hors réseau. */
  const [rc, rj, rf, ci, cf, id, ev, ra, rfa] = await Promise.all([
    store.get("cycle:codes"), store.get("cycle:jours"), store.get("cycle:prefs"),
    store.get("courses:items"), store.get("courses:frequents"),
    store.get("idees:liste"),
    store.get("agenda:evenements"), store.get("rappels:liste"), store.get("rappels:faits")
  ]);
  if(rc)  M.remplacerRef(deballer(rc));
  if(rj)  M.remplacerJours(deballer(rj));
  if(rf)  M.remplacerPrefs(deballer(rf));
  if(ci)  C.remplacerItems(deballer(ci));
  if(cf)  C.remplacerFrequents(deballer(cf));
  if(id)  remplacerIdees(deballer(id));
  if(ev)  remplacerEvenements(deballer(ev));
  if(ra)  R.remplacerRappels(deballer(ra));
  if(rfa) R.remplacerFaits(deballer(rfa));

  /* mise en conformité + ménage : on écrit le cache sans signaler de modification,
     chaque appareil fait le même calcul de son côté */
  M.migrate();
  M.pruneJours(M.jours);
  M.ecrireCache();

  initDateDebut();
  $("lead").value = M.prefs.lead;
  $("calName").value = M.prefs.calName;

  renderAll();
  showTab("agenda");   /* c'est ce qu'on regarde le plus souvent en ouvrant l'appli */

  await ouvrirSession(await Auth.sessionCourante());

  if(erreurLien && !Auth.getSession())
    direAuth("Ce lien n'est plus valable — un lien ne sert qu'une fois, et il expire. "
      + "Connecte-toi avec ton mot de passe, ou demande un nouveau lien.");

  Auth.surChangementDeSession(async s => {
    if(s && !Auth.getSession()) await ouvrirSession(s);
    else if(!s && Auth.getSession()){ Auth.fermer(); montrerEcrans(); }
  });

  window.addEventListener("online", () => { if(Auth.getSession()) sync.maintenant(true); });
  document.addEventListener("visibilitychange", () => {
    if(!document.hidden && Auth.getSession()) sync.maintenant(true);
  });
})();
