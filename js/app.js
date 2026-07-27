/* Démarrage de l'appli : câblage des modules, connexion, synchronisation.

   C'est le seul fichier qui connaisse tout le monde. Les modules, eux, ne se
   connaissent pas entre eux — ils passent par le bus de signaux. */

import {$, esc, showTab, brancherOnglets} from "./noyau/ui.js";
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
  el.style.color = warn ? "#7A5310" : "";
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
    ? `Connectée en tant que <strong>${esc(moi.prenom)}</strong>${moi.role === "enfant" ? " (lecture seule)" : ""}.
       Tout est partagé avec l’autre compte et se met à jour tout seul.`
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

async function connexionEnvoyer(){
  const mail = $("authMail").value.trim();
  if(!mail) return;
  $("authBtn").disabled = true;
  const {error} = await Auth.envoyerLien(mail);
  $("authBtn").disabled = false;
  $("authMsg").innerHTML = error
    ? `<p class="msg warn">${esc(error.message)}</p>`
    : `<p class="msg ok">Lien envoyé à ${esc(mail)}. Ouvre-le depuis cet appareil — il te ramènera ici, connecté.</p>`;
}

/* ---------- câblage ---------- */
brancherOnglets();
brancherImporter();
brancherPlanning();
brancherExport();
brancherCourses();
brancherAgenda();
R.brancherRappels();
brancherIdees();

$("authBtn").addEventListener("click", connexionEnvoyer);
$("authMail").addEventListener("keydown", e => { if(e.key === "Enter") connexionEnvoyer(); });
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
$("deconnexion").addEventListener("click", async () => {
  if(!confirm("Se déconnecter de cet appareil ?")) return;
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

  Auth.surChangementDeSession(async s => {
    if(s && !Auth.getSession()) await ouvrirSession(s);
    else if(!s && Auth.getSession()){ Auth.fermer(); montrerEcrans(); }
  });

  window.addEventListener("online", () => { if(Auth.getSession()) sync.maintenant(true); });
  document.addEventListener("visibilitychange", () => {
    if(!document.hidden && Auth.getSession()) sync.maintenant(true);
  });
})();
