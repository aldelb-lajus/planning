/* Agenda : vacances, soirées, repas, rendez-vous.

   Ce module fait une chose qu'aucune appli du commerce ne ferait : il montre le
   poste de Fab en même temps que les événements. En liste, en face de chaque
   ligne ; en grille, en teintant le fond des jours travaillés. « On cale un
   dîner samedi ? » se répond d'un coup d'œil. C'est la raison d'avoir réuni le
   planning et l'agenda dans la même appli. */

import {$, esc, ouvrirFeuille, demanderConfirmation} from "../noyau/ui.js";
import {emettre} from "../noyau/signal.js";
import {store, emballer} from "../noyau/store.js";
import {creerSync} from "../noyau/sync.js";
import {iso, isoInput, dateFrom, fmtLong, moisLbl} from "../noyau/dates.js";
import {membres, prenomDe} from "../noyau/supabase.js";
import * as M from "../planning/modele.js";

export let evenements = {};   // id -> {titre, categorie, debut, fin, heure, note, assigneA}

/* La couleur du rond qui porte l'émoji vient du CSS, choisie sur `data-cat` :
   voir la règle `.emo[data-cat=…]` dans css/app.css. */
export const CATEGORIES = {
  repas:   {lbl:"Repas",       emoji:"🍽️"},
  soiree:  {lbl:"Soirée",      emoji:"🎉"},
  vacances:{lbl:"Vacances",    emoji:"🌴"},
  rdv:     {lbl:"Rendez-vous", emoji:"📌"},
  autre:   {lbl:"Autre",       emoji:"✨"}
};

let vue = "liste";              // "liste" | "grille"
let moisAffiche = null;         // 1er du mois montré en grille

/* Filtre par assignation. Les cases sont ÉTANCHES : « Alice » ne montre que ce
   qui lui est assigné, jamais le commun. C'est ce qui fait de « Commun » une
   case comme les autres et non un fourre-tout qui déborderait partout ; pour
   voir sa journée entière on repasse par « Tout », qui est le premier bouton.

   Une seule dimension, comme pour les rappels — pas de croisement avec le type
   d'événement. Valeurs : "tout" · "commun" · "moi:<id>". */
let filtre = "tout";

const concerne = e =>
    filtre === "tout"   ? true
  : filtre === "commun" ? !e.assigneA
  : e.assigneA === filtre.slice(4);

const save = () => { store.set("agenda:evenements", emballer(evenements)); emettre("modifie"); };
export const remplacerEvenements = o => { evenements = o || {}; };

/* ---------- synchronisation ---------- */
export function creerSyncAgenda({statut, apresLecture}){
  return creerSync({
    collections: [{
      nom:"evenements", table:"evenement", cle:"id",
      colonnes:"id, titre, categorie, debut, fin, heure, note, assigne_a, cree_par",
      donnees:   () => evenements,
      remplacer: o  => remplacerEvenements(o),
      versLigne: (id, e) => ({
        id, titre:e.titre, categorie:e.categorie, debut:e.debut,
        fin:e.fin || null, heure:e.heure || null, note:e.note || "",
        assigne_a:e.assigneA || null
      }),
      depuisLigne: r => [r.id, {
        titre:r.titre, categorie:r.categorie, debut:r.debut,
        fin:r.fin, heure:r.heure ? String(r.heure).slice(0,5) : null,
        note:r.note || "", assigneA:r.assigne_a, creePar:r.cree_par
      }]
    }],
    statut,
    apresLecture(){ store.set("agenda:evenements", emballer(evenements)); apresLecture(); }
  });
}

/* ---------- lecture ---------- */
/* Un événement reste « à venir » tant que son dernier jour n'est pas passé :
   des vacances en cours doivent rester en tête, pas disparaître le 2e jour. */
const dernierJour = e => e.fin || e.debut;

export function aVenir(){
  const auj = isoInput(new Date());
  return Object.entries(evenements)
    .filter(([, e]) => dernierJour(e) >= auj && concerne(e))
    .sort((a, b) => a[1].debut.localeCompare(b[1].debut)
                 || (a[1].heure || "").localeCompare(b[1].heure || ""));
}

/* Comptés sur ce que le filtre laisse passer, pour que la ligne de contexte de
   l'en-tête parle bien de ce qui est à l'écran. */
export const passes = () =>
  Object.values(evenements).filter(concerne).length - aVenir().length;

/* Événements couvrant un jour donné, plage comprise. Filtrés eux aussi : sans
   ça, choisir « Alice » viderait la liste mais laisserait la grille pleine. */
export const duJour = dateIso => Object.entries(evenements)
  .filter(([, e]) => e.debut <= dateIso && dernierJour(e) >= dateIso && concerne(e))
  .sort((a, b) => (a[1].heure || "").localeCompare(b[1].heure || ""));

/* Poste de Fab un jour donné. Rend null si le planning ne couvre pas ce jour —
   l'affichage se tait alors plutôt que d'annoncer à tort une disponibilité. */
export function posteDe(dateIso){
  const cle = dateIso.replaceAll("-", "");
  if(!(cle in M.jours)) return null;
  const code = M.jours[cle];
  if(!code) return null;
  const k = M.ref[code];
  if(!k) return null;
  return {code, type:k.type, libre:M.NOALARM(k.type), segs:M.segsOf(k)};
}

/* ---------- écriture ---------- */
function valider(champs){
  return champs.titre.trim() && champs.debut
      && (!champs.fin || champs.fin >= champs.debut);
}

export function ajouterEvenement(champs){
  if(!valider(champs)) return null;
  const id = crypto.randomUUID();
  evenements[id] = {
    titre:champs.titre.trim(), categorie:champs.categorie || "autre",
    debut:champs.debut, fin:champs.fin || null, heure:champs.heure || null,
    note:(champs.note || "").trim(),
    assigneA: champs.assigneA || null
  };
  save();
  return id;
}

export function modifierEvenement(id, champs){
  if(!evenements[id] || !valider(champs)) return false;
  Object.assign(evenements[id], {
    titre:champs.titre.trim(), categorie:champs.categorie,
    debut:champs.debut, fin:champs.fin || null, heure:champs.heure || null,
    note:(champs.note || "").trim(),
    assigneA: champs.assigneA || null
  });
  save();
  return true;
}

export function supprimerEvenement(id){ delete evenements[id]; save(); }

/* ---------- assignation ----------
   « Commun » d'abord, et c'est la valeur par défaut : la plupart des événements
   concernent les deux. Un événement assigné à quelqu'un n'est PAS commun — les
   deux cases sont étanches, dans le menu comme dans le filtre. */
function optionsPersonnes(choisi){
  return `<option value="">Commun</option>`
    + membres().map(m =>
        `<option value="${m.id}"${m.id === choisi ? " selected" : ""}>${esc(m.prenom)}</option>`).join("");
}

/* ---------- feuille de modification ---------- */
export function ouvrirEditeur(id, jourParDefaut){
  const e = id ? evenements[id] : {
    titre:"", categorie:"autre", debut:jourParDefaut || isoInput(new Date()),
    fin:null, heure:null, note:"", assigneA:null
  };
  const opt = Object.entries(CATEGORIES).map(([k, c]) =>
    `<option value="${k}"${k === e.categorie ? " selected" : ""}>${c.emoji} ${c.lbl}</option>`).join("");

  ouvrirFeuille(id ? "Modifier l'événement" : "Nouvel événement", `
    <label for="edTitre">Quoi&nbsp;?</label>
    <input type="text" id="edTitre" value="${esc(e.titre)}" autocomplete="off">
    <div class="row">
      <div><label for="edDebut">Le</label><input type="date" id="edDebut" value="${e.debut}"></div>
      <div><label for="edFin">Jusqu'au</label><input type="date" id="edFin" value="${e.fin || ""}"></div>
      <div><label for="edHeure">Heure</label><input type="time" id="edHeure" value="${e.heure || ""}"></div>
    </div>
    <div class="row">
      <div><label for="edCat">Type</label><select id="edCat">${opt}</select></div>
      <div><label for="edQui">Pour qui</label><select id="edQui">${optionsPersonnes(e.assigneA)}</select></div>
    </div>
    <label for="edNote">Note</label>
    <input type="text" id="edNote" value="${esc(e.note)}" autocomplete="off">
    <div id="edMsg"></div>
    ${id ? `<div class="row"><button class="ghost danger" id="edSuppr">Supprimer cet événement</button></div>` : ""}
  `, (ov, fermer) => {
    const lire = () => ({
      titre:$("edTitre").value, categorie:$("edCat").value, debut:$("edDebut").value,
      fin:$("edFin").value, heure:$("edHeure").value, note:$("edNote").value,
      assigneA:$("edQui").value
    });

    if(id) ov.querySelector("#edSuppr").addEventListener("click", async () => {
      if(!await demanderConfirmation(`Supprimer « ${e.titre} » ?`,
        "Cet événement sera retiré de l'agenda.", {valider:"Supprimer", danger:true})) return;
      supprimerEvenement(id);
      fermer();
      emettre("rendre");
    });

    ov.querySelector("[data-valider]").addEventListener("click", () => {
      const champs = lire();
      if(!champs.titre.trim() || !champs.debut){
        $("edMsg").innerHTML = `<p class="msg warn">Il faut au moins un titre et une date de début.</p>`;
        return;
      }
      if(champs.fin && champs.fin < champs.debut){
        $("edMsg").innerHTML = `<p class="msg warn">La date de fin est avant celle de début.</p>`;
        return;
      }
      if(id) modifierEvenement(id, champs); else ajouterEvenement(champs);
      fermer();
      emettre("rendre");
    });
  });
}

/* ---------- vue liste ---------- */
function ligneEvenement(id, e){
  const cat = CATEGORIES[e.categorie] || CATEGORIES.autre;
  const plusieursJours = e.fin && e.fin !== e.debut;
  const quand = plusieursJours
    ? `${fmtLong(dateFrom(e.debut))} → ${fmtLong(dateFrom(e.fin))}`
    : fmtLong(dateFrom(e.debut)) + (e.heure ? ` · ${e.heure}` : "");

  /* le poste de Fab, seulement pour un événement d'un seul jour :
     sur une plage de vacances, l'information n'aurait pas de sens */
  let poste = "";
  if(!plusieursJours){
    const p = posteDe(e.debut);
    if(p) poste = p.libre
      ? `<span class="dispo libre">Fab est en ${esc(M.TYPES[p.type].lbl.toLowerCase())}</span>`
      : `<span class="dispo occupe">Fab travaille — ${esc(p.code)}${
          p.segs.length ? " · " + p.segs.map(s => s.debut + "–" + s.fin).join(" · ") : ""}</span>`;
  }

  /* Le prénom reste affiché quel que soit le filtre — même règle que les
     rappels : l'information ne doit jamais dépendre de la vue choisie.
     Titre et prénom sont enfermés ensemble dans « ctitre », sans quoi « clib »,
     qui empile ses enfants en colonne, renverrait le prénom à la ligne. */
  const qui = prenomDe(e.assigneA);

  return `<li class="citem" data-evt="${id}" role="button" tabindex="0">
    <span class="emo" data-cat="${esc(e.categorie)}" title="${esc(cat.lbl)}">${cat.emoji}</span>
    <span class="clib">
      <span class="ctitre">${esc(e.titre)}${qui ? `<span class="qui">${esc(qui)}</span>` : ""}</span>
      <small class="par">${esc(quand)}</small>
      ${poste}${e.note ? `<small class="par">${esc(e.note)}</small>` : ""}</span>
  </li>`;
}

function listeHtml(){
  const liste = aVenir();
  if(!liste.length)
    return filtre === "tout"
      ? `<p class="msg">Rien de prévu — ajoute vacances, soirées, repas ou rendez-vous.</p>`
      : `<p class="msg">Rien à venir dans ce filtre.</p>`;
  let h = "", moisCourant = "";
  liste.forEach(([id, e]) => {
    const m = moisLbl(dateFrom(e.debut));
    if(m !== moisCourant){
      if(moisCourant) h += "</ul>";
      moisCourant = m;
      h += `<div class="lmois">${esc(m)}</div><ul class="clist">`;
    }
    h += ligneEvenement(id, e);
  });
  return h + "</ul>";
}

/* ---------- vue grille ---------- */
function grilleHtml(){
  const base = moisAffiche || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const premier = new Date(base.getFullYear(), base.getMonth(), 1);
  const dernier = new Date(base.getFullYear(), base.getMonth()+1, 0);
  /* la grille commence au lundi précédant le 1er et finit au dimanche suivant */
  const d0 = new Date(premier); d0.setDate(d0.getDate() - (d0.getDay()+6)%7);
  const d1 = new Date(dernier); d1.setDate(d1.getDate() + (7-dernier.getDay())%7);
  const auj = isoInput(new Date());

  let h = `<div class="anav">
      <button class="ghost" id="moisPrec" aria-label="Mois précédent">‹</button>
      <strong>${esc(moisLbl(premier))}</strong>
      <button class="ghost" id="moisSuiv" aria-label="Mois suivant">›</button>
    </div>
    <div class="grid">${M.DOW.map(d => `<div class="dow">${d}</div>`).join("")}`;

  for(let d = new Date(d0); d <= d1; d.setDate(d.getDate()+1)){
    const cle = isoInput(d);
    const horsMois = d.getMonth() !== premier.getMonth();
    const evts = duJour(cle);
    const p = posteDe(cle);

    /* Le FOND de la case dit le poste de Fab — une bande de 5 px au flanc
       gauche était trop étroite pour se voir, et assez large pour rogner la
       place des événements. La teinte « douce » de chaque type est un jeton à
       part (--matin-doux…) : c'est ce qui la rend juste en clair comme en
       sombre, là où une transparence appliquée à la couleur pleine virait au
       gris dans un cas sur deux. */
    const poste = p && !p.libre ? ` data-poste="${esc(p.type)}"` : "";

    /* Trois émojis tiennent et se lisent ; un titre à sept colonnes sur un
       téléphone se réduirait à « Dîne… ». Chacun ouvre son événement. */
    const vus = evts.slice(0, 3).map(([id, e]) => {
      const cat = CATEGORIES[e.categorie] || CATEGORIES.autre;
      return `<span class="aevt" data-evt="${id}" role="button" tabindex="0"
                title="${esc(e.titre)}${e.heure ? " · " + e.heure : ""}">${cat.emoji}</span>`;
    }).join("");

    const tt = d.toLocaleDateString("fr-FR")
      + (p ? (p.libre ? " — Fab est en " + M.TYPES[p.type].lbl.toLowerCase()
                      : " — Fab travaille (" + p.code + ")") : "")
      + (evts.length ? " — " + evts.map(([, e]) => e.titre).join(", ") : "");

    h += `<div class="acell${horsMois ? " hors" : ""}${cle === auj ? " today" : ""}"
            data-jour="${cle}"${poste} title="${esc(tt)}">
        <span class="anum">${d.getDate()}${
          p && !p.libre ? `<b data-poste="${esc(p.type)}">${esc(p.code)}</b>` : ""}</span>
        <span class="aevts">${vus}${evts.length > 3 ? `<b class="aplus">+${evts.length-3}</b>` : ""}</span>
      </div>`;
  }
  return h + `</div>`;
}

/* ---------- rendu ---------- */
/* Barre de filtres : « Tout », puis « Commun », puis un bouton par compte.
   Comptée sur TOUS les événements, pas seulement ceux à venir : en vue grille
   on remonte des mois passés, et un bouton qui disparaîtrait en chemin ferait
   croire que le filtre a sauté. Un compte sans aucun événement n'a pas de
   bouton — une barre dont la moitié des entrées mènent au vide n'aide personne. */
function renderFiltres(){
  const barre = $("agendaFiltres");
  const tous = Object.values(evenements);
  if(!barre) return;

  const compte = cle => tous.filter(e =>
    cle === "commun" ? !e.assigneA : e.assigneA === cle.slice(4)).length;

  const boutons = [{cle:"tout", lbl:"Tout", n:tous.length}];
  if(compte("commun")) boutons.push({cle:"commun", lbl:"Commun", n:compte("commun"), groupe:true});
  let debutFamille = !boutons.some(b => b.groupe);
  membres().forEach(m => {
    const cle = "moi:" + m.id;
    if(!compte(cle)) return;
    boutons.push({cle, lbl:m.prenom, n:compte(cle), groupe:debutFamille});
    debutFamille = false;
  });

  /* le filtre courant a pu disparaître : son dernier événement vient d'être
     supprimé, ou de changer de personne */
  if(!boutons.some(b => b.cle === filtre)) filtre = "tout";

  /* Un seul bouton (« Tout ») : il n'y a rien à filtrer, la barre ne sert qu'à
     occuper de la place. */
  barre.hidden = boutons.length < 2;
  barre.innerHTML = boutons.map(b =>
    (b.groupe ? `<span class="fsep" aria-hidden="true"></span>` : "")
    + `<button data-f="${esc(b.cle)}" aria-current="${filtre === b.cle ? "page" : "false"}">${esc(b.lbl)} ${b.n}</button>`
  ).join("");

  barre.querySelectorAll("[data-f]").forEach(b =>
    b.addEventListener("click", () => { filtre = b.dataset.f; renderAgenda(); }));
}

export function renderAgenda(){
  const box = $("agendaListe");
  if(!box) return;
  renderFiltres();
  const liste = aVenir();
  const nbPasses = passes();

  /* Ligne de contexte de l'en-tête : elle est en petites capitales, donc elle
     doit tenir sur une ligne — d'où le compte sec plutôt qu'une phrase. */
  $("agendaInfo").textContent = liste.length
    ? `${liste.length} à venir` + (nbPasses ? ` · ${nbPasses} passés` : "")
    : (nbPasses ? `Rien à venir · ${nbPasses} passés` : "Rien de prévu");

  $("agVueGrille").setAttribute("aria-pressed", vue === "grille");
  $("agVueListe").setAttribute("aria-pressed", vue === "liste");
  box.innerHTML = vue === "grille" ? grilleHtml() : listeHtml();

  if(vue === "grille"){
    $("moisPrec").addEventListener("click", () => { decalerMois(-1); });
    $("moisSuiv").addEventListener("click", () => { decalerMois(1); });
    /* Un émoji ouvre directement son événement ; le reste de la case ouvre le
       jour. Sans le stopPropagation, les deux se déclencheraient d'affilée. */
    box.querySelectorAll(".aevt").forEach(el => {
      const ouvrir = e => { e.stopPropagation(); ouvrirEditeur(el.dataset.evt); };
      el.addEventListener("click", ouvrir);
      el.addEventListener("keydown", e => { if(e.key === "Enter") ouvrir(e); });
    });
    box.querySelectorAll("[data-jour]").forEach(c =>
      c.addEventListener("click", () => ouvrirJour(c.dataset.jour)));
  }else{
    box.querySelectorAll("[data-evt]").forEach(li => {
      const ouvrir = () => ouvrirEditeur(li.dataset.evt);
      li.addEventListener("click", ouvrir);
      li.addEventListener("keydown", e => { if(e.key === "Enter") ouvrir(); });
    });
  }
}

function decalerMois(n){
  const base = moisAffiche || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  moisAffiche = new Date(base.getFullYear(), base.getMonth()+n, 1);
  renderAgenda();
}

/* Feuille d'un jour : ce qui s'y passe, plus de quoi en ajouter. */
function ouvrirJour(cle){
  const evts = duJour(cle);
  const p = posteDe(cle);
  const dispo = p
    ? (p.libre ? `<p class="msg ok">Fab est en ${esc(M.TYPES[p.type].lbl.toLowerCase())}.</p>`
               : `<p class="msg">Fab travaille — ${esc(p.code)}${p.segs.length ? " · " + p.segs.map(s => s.debut+"–"+s.fin).join(" · ") : ""}.</p>`)
    : "";
  /* Le prénom s'affiche ici comme dans la liste et comme dans les rappels : une
     même information ne doit pas apparaître à un endroit et disparaître à un
     autre. « ctitre » réunit titre et prénom sur une ligne — « clib » empile ses
     enfants en colonne, un prénom posé à côté tomberait à la ligne suivante. */
  const corps = evts.length
    ? `<ul class="clist">${evts.map(([id, e]) => {
        const cat = CATEGORIES[e.categorie] || CATEGORIES.autre;
        const qui = prenomDe(e.assigneA);
        return `<li class="citem" data-evt="${id}" role="button" tabindex="0">
          <span class="emo" data-cat="${esc(e.categorie)}">${cat.emoji}</span>
          <span class="clib">
            <span class="ctitre">${esc(e.titre)}${qui ? `<span class="qui">${esc(qui)}</span>` : ""}</span>
            ${e.heure ? `<small class="par">${esc(e.heure)}</small>` : ""}</span>
        </li>`;
      }).join("")}</ul>`
    : `<p class="msg">Rien de prévu ce jour-là.</p>`;

  ouvrirFeuille(fmtLong(dateFrom(cle)).replace(/^./, x => x.toUpperCase()),
    `${dispo}${corps}<div class="row"><button class="ghost" id="jourAjout">+ Ajouter un événement</button></div>`,
    (ov, fermer) => {
      ov.querySelectorAll("[data-evt]").forEach(li =>
        li.addEventListener("click", () => { fermer(); ouvrirEditeur(li.dataset.evt); }));
      ov.querySelector("#jourAjout").addEventListener("click", () => { fermer(); ouvrirEditeur(null, cle); });
      /* « Valider » n'a rien à valider ici : la feuille est une consultation */
      ov.querySelector("[data-valider]").addEventListener("click", fermer);
    });
}

export function brancherAgenda(){
  $("evtNouveau").addEventListener("click", () => ouvrirEditeur(null));
  $("agVueGrille").addEventListener("click", () => { vue = "grille"; renderAgenda(); });
  $("agVueListe").addEventListener("click",  () => { vue = "liste";  renderAgenda(); });
}
