/* Agenda : vacances, soirées, repas, rendez-vous.

   Ce module fait une chose qu'aucune appli du commerce ne ferait : il montre le
   poste de Fab en même temps que les événements. En liste, en face de chaque
   ligne ; en grille, en teintant le fond des jours travaillés. « On cale un
   dîner samedi ? » se répond d'un coup d'œil. C'est la raison d'avoir réuni le
   planning et l'agenda dans la même appli. */

import {$, esc, ouvrirFeuille} from "../noyau/ui.js";
import {emettre} from "../noyau/signal.js";
import {store, emballer} from "../noyau/store.js";
import {creerSync} from "../noyau/sync.js";
import {iso, isoInput, dateFrom, fmtLong, moisLbl} from "../noyau/dates.js";
import * as M from "../planning/modele.js";

export let evenements = {};   // id -> {titre, categorie, debut, fin, heure, note}

export const CATEGORIES = {
  repas:   {lbl:"Repas",       emoji:"🍽️", c:"var(--matin)"},
  soiree:  {lbl:"Soirée",      emoji:"🥂", c:"var(--aprem)"},
  vacances:{lbl:"Vacances",    emoji:"🌴", c:"var(--vacances)"},
  rdv:     {lbl:"Rendez-vous", emoji:"📌", c:"var(--nuit)"},
  autre:   {lbl:"Autre",       emoji:"✨", c:"var(--autre)"}
};

let vue = "liste";              // "liste" | "grille"
let moisAffiche = null;         // 1er du mois montré en grille

const save = () => { store.set("agenda:evenements", emballer(evenements)); emettre("modifie"); };
export const remplacerEvenements = o => { evenements = o || {}; };

/* ---------- synchronisation ---------- */
export function creerSyncAgenda({statut, apresLecture}){
  return creerSync({
    collections: [{
      nom:"evenements", table:"evenement", cle:"id",
      colonnes:"id, titre, categorie, debut, fin, heure, note, cree_par",
      donnees:   () => evenements,
      remplacer: o  => remplacerEvenements(o),
      versLigne: (id, e) => ({
        id, titre:e.titre, categorie:e.categorie, debut:e.debut,
        fin:e.fin || null, heure:e.heure || null, note:e.note || ""
      }),
      depuisLigne: r => [r.id, {
        titre:r.titre, categorie:r.categorie, debut:r.debut,
        fin:r.fin, heure:r.heure ? String(r.heure).slice(0,5) : null,
        note:r.note || "", creePar:r.cree_par
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
    .filter(([, e]) => dernierJour(e) >= auj)
    .sort((a, b) => a[1].debut.localeCompare(b[1].debut)
                 || (a[1].heure || "").localeCompare(b[1].heure || ""));
}

export const passes = () => Object.keys(evenements).length - aVenir().length;

/* Événements couvrant un jour donné, plage comprise. */
export const duJour = dateIso => Object.entries(evenements)
  .filter(([, e]) => e.debut <= dateIso && dernierJour(e) >= dateIso)
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
    note:(champs.note || "").trim()
  };
  save();
  return id;
}

export function modifierEvenement(id, champs){
  if(!evenements[id] || !valider(champs)) return false;
  Object.assign(evenements[id], {
    titre:champs.titre.trim(), categorie:champs.categorie,
    debut:champs.debut, fin:champs.fin || null, heure:champs.heure || null,
    note:(champs.note || "").trim()
  });
  save();
  return true;
}

export function supprimerEvenement(id){ delete evenements[id]; save(); }

/* ---------- feuille de modification ---------- */
export function ouvrirEditeur(id, jourParDefaut){
  const e = id ? evenements[id] : {
    titre:"", categorie:"autre", debut:jourParDefaut || isoInput(new Date()),
    fin:null, heure:null, note:""
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
      <div><label for="edNote">Note</label><input type="text" id="edNote" value="${esc(e.note)}" autocomplete="off"></div>
    </div>
    <div id="edMsg"></div>
    ${id ? `<div class="row"><button class="ghost danger" id="edSuppr">Supprimer cet événement</button></div>` : ""}
  `, (ov, fermer) => {
    const lire = () => ({
      titre:$("edTitre").value, categorie:$("edCat").value, debut:$("edDebut").value,
      fin:$("edFin").value, heure:$("edHeure").value, note:$("edNote").value
    });

    if(id) ov.querySelector("#edSuppr").addEventListener("click", () => {
      if(!confirm(`Supprimer « ${e.titre} » ?`)) return;
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

  return `<li class="citem" data-evt="${id}" role="button" tabindex="0">
    <span class="emo" title="${esc(cat.lbl)}">${cat.emoji}</span>
    <span class="clib">${esc(e.titre)}
      <small class="par">${esc(quand)}</small>
      ${poste}${e.note ? `<small class="par">${esc(e.note)}</small>` : ""}</span>
  </li>`;
}

function listeHtml(){
  const liste = aVenir();
  if(!liste.length)
    return `<p class="msg">Rien de prévu — ajoute vacances, soirées, repas ou rendez-vous.</p>`;
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

    /* Bande étroite sur le flanc gauche = poste de Fab. Sa couleur est celle du
       type de poste, atténuée par l'opacité — la case reste au contenu, la
       disponibilité se lit du coin de l'œil.
       (L'opacité passe par une propriété à part : « var(--matin)1F » est une
       règle invalide, on ne colle pas une transparence derrière une variable.) */
    const bande = p && !p.libre
      ? `<i class="abande" style="background:${M.TYPES[p.type].c}"></i>` : "";

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
            data-jour="${cle}" title="${esc(tt)}">
        ${bande}
        <span class="anum">${d.getDate()}${p && !p.libre ? `<b>${esc(p.code)}</b>` : ""}</span>
        <span class="aevts">${vus}${evts.length > 3 ? `<b class="aplus">+${evts.length-3}</b>` : ""}</span>
      </div>`;
  }
  return h + `</div><p class="hint" style="margin-top:10px">Bande de couleur à gauche&nbsp;:
    Fab travaille, avec son code. Émojis&nbsp;: les événements — appuie dessus pour
    en modifier un, ou ailleurs dans la case pour voir le jour entier.</p>`;
}

/* ---------- rendu ---------- */
export function renderAgenda(){
  const box = $("agendaListe");
  if(!box) return;
  const liste = aVenir();
  const nbPasses = passes();

  $("agendaInfo").innerHTML = liste.length
    ? `${liste.length} à venir`
      + (nbPasses ? ` <span style="color:var(--ink-soft)">· ${nbPasses} passé${nbPasses>1?"s":""} masqué${nbPasses>1?"s":""}</span>` : "")
    : (nbPasses ? `Rien à venir · ${nbPasses} événement${nbPasses>1?"s":""} passé${nbPasses>1?"s":""}` : "");

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
  const corps = evts.length
    ? `<ul class="clist">${evts.map(([id, e]) => {
        const cat = CATEGORIES[e.categorie] || CATEGORIES.autre;
        return `<li class="citem" data-evt="${id}" role="button" tabindex="0">
          <span class="emo">${cat.emoji}</span>
          <span class="clib">${esc(e.titre)}${e.heure ? `<small class="par">${e.heure}</small>` : ""}</span>
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
