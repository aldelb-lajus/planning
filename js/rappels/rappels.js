/* Rappels : ce qui revient, et ce qu'on ne veut pas oublier.

   Vaccins, vermifuge, croquettes, impôts, entretien du chauffe-eau. Un seul
   moteur pour tout ça : le suivi des chats n'est pas un module à part, c'est
   un rappel de catégorie « chats ». Écrire quatre modules quasi identiques
   aurait coûté quatre fois les mêmes bugs.

   Trois formes possibles :
     - récurrent  : revient tous les N jours ou N mois
     - ponctuel   : une date, une seule fois
     - pense-bête : aucune date, juste à ne pas oublier

   Un rappel garde son historique : « c'était quand, la dernière fois ? » est
   exactement la question à laquelle l'appli doit répondre. */

import {$, esc, ouvrirFeuille, demanderConfirmation, demanderValeur} from "../noyau/ui.js";
import {emettre} from "../noyau/signal.js";
import {store, emballer} from "../noyau/store.js";
import {creerSync} from "../noyau/sync.js";
import {isoInput, dateFrom, fmtLong} from "../noyau/dates.js";
import {membres, prenomDe} from "../noyau/supabase.js";

export let rappels = {};   // id -> {titre, categorie, periodeValeur, periodeUnite, prochaineLe, note, assigneA}
export let faits = {};     // id -> {rappelId, faitLe, note}

/* L'émoji sert de repère visuel dans la liste : on retrouve d'un coup d'œil
   ce qui concerne les chats sans lire les libellés. */
export const CATEGORIES = {
  chat:  {lbl:"Chats",         emoji:"🐾"},
  maison:{lbl:"Maison",        emoji:"🏠"},
  admin: {lbl:"Administratif", emoji:"📄"},
  sante: {lbl:"Santé",         emoji:"💊"},
  autre: {lbl:"Autre",         emoji:"✨"}
};

/* Raccourcis proposés ; « Personnalisée » ouvre la saisie libre juste à côté et
   doit rester EN DERNIER — `indexPeriode` y retombe pour toute périodicité qui
   ne figure pas dans cette liste. */
export const PERIODES = [
  {v:null, u:null,      lbl:"Aucune date"},
  {v:0,    u:"une",     lbl:"Une seule fois"},
  {v:1,    u:"semaine", lbl:"Toutes les semaines"},
  {v:2,    u:"semaine", lbl:"Toutes les 2 semaines"},
  {v:1,    u:"mois",    lbl:"Tous les mois"},
  {v:3,    u:"mois",    lbl:"Tous les 3 mois"},
  {v:6,    u:"mois",    lbl:"Tous les 6 mois"},
  {v:12,   u:"mois",    lbl:"Tous les ans"},
  {v:-1,   u:"perso",   lbl:"Personnalisée…"}
];

const save = () => {
  store.set("rappels:liste", emballer(rappels));
  store.set("rappels:faits", emballer(faits));
  emettre("modifie");
};
export const remplacerRappels = o => { rappels = o || {}; };
export const remplacerFaits   = o => { faits = o || {}; };

/* ---------- synchronisation ---------- */
export function creerSyncRappels({statut, apresLecture}){
  return creerSync({
    /* rappel_fait cite rappel : l'ordre compte, le parent d'abord */
    collections: [
      {
        nom:"rappels", table:"rappel", cle:"id",
        colonnes:"id, titre, categorie, periode_valeur, periode_unite, prochaine_le, note, assigne_a",
        donnees:   () => rappels,
        remplacer: o  => remplacerRappels(o),
        versLigne: (id, r) => ({
          id, titre:r.titre, categorie:r.categorie,
          periode_valeur:r.periodeValeur || null, periode_unite:r.periodeUnite || null,
          prochaine_le:r.prochaineLe || null, note:r.note || "",
          assigne_a:r.assigneA || null
        }),
        depuisLigne: l => [l.id, {
          titre:l.titre, categorie:l.categorie,
          periodeValeur:l.periode_valeur, periodeUnite:l.periode_unite,
          prochaineLe:l.prochaine_le, note:l.note || "", assigneA:l.assigne_a
        }]
      },
      {
        nom:"faits", table:"rappel_fait", cle:"id",
        colonnes:"id, rappel_id, fait_le, note, cree_par",
        donnees:   () => faits,
        remplacer: o  => remplacerFaits(o),
        versLigne: (id, f) => ({id, rappel_id:f.rappelId, fait_le:f.faitLe, note:f.note || ""}),
        depuisLigne: l => [l.id, {rappelId:l.rappel_id, faitLe:l.fait_le, note:l.note || "", creePar:l.cree_par}]
      }
    ],
    statut,
    apresLecture(){
      store.set("rappels:liste", emballer(rappels));
      store.set("rappels:faits", emballer(faits));
      apresLecture();
    }
  });
}

/* ---------- lecture ---------- */
export const joursAvant = dateIso => {
  const auj = new Date(); auj.setHours(0,0,0,0);
  return Math.round((dateFrom(dateIso) - auj) / 86400000);
};

export function historique(rappelId){
  return Object.values(faits)
    .filter(f => f.rappelId === rappelId)
    .sort((a, b) => b.faitLe.localeCompare(a.faitLe));
}

export const dernierFait = rappelId => historique(rappelId)[0] || null;

/* Les plus urgents en tête ; les pense-bêtes sans date ferment la marche,
   puisqu'ils ne réclament rien. */
export const parUrgence = () => Object.entries(rappels).sort((a, b) => {
  const da = a[1].prochaineLe, db = b[1].prochaineLe;
  if(!da && !db) return a[1].titre.localeCompare(b[1].titre);
  if(!da) return 1;
  if(!db) return -1;
  return da.localeCompare(db);
});

export const enRetard = () =>
  parUrgence().filter(([, r]) => r.prochaineLe && joursAvant(r.prochaineLe) < 0).length;

/* « toutes les semaines », mais « tous les mois » : le genre suit l'unité, et
   au singulier on ne dit pas « tous les 1 jour ». L'ancienne version ne traitait
   ce cas que pour les mois — un rappel quotidien s'annonçait « tous les 1 jour ». */
export function libellePeriode(r){
  if(!r.periodeValeur) return r.prochaineLe ? "une seule fois" : "sans date";
  const n = r.periodeValeur;
  if(r.periodeUnite === "semaine")
    return n === 1 ? "toutes les semaines" : `toutes les ${n} semaines`;
  if(r.periodeUnite === "mois")
    return n === 1 ? "tous les mois" : `tous les ${n} mois`;
  return n === 1 ? "tous les jours" : `tous les ${n} jours`;
}

/* ---------- écriture ---------- */
export function ajouterRappel(champs){
  if(!champs.titre.trim()) return null;
  const periodique = champs.periodeValeur > 0;
  if(periodique && !champs.prochaineLe) return null;      /* un récurrent a forcément une date */
  const id = crypto.randomUUID();
  rappels[id] = {
    titre:champs.titre.trim(), categorie:champs.categorie || "autre",
    periodeValeur: periodique ? Number(champs.periodeValeur) : null,
    periodeUnite:  periodique ? champs.periodeUnite : null,
    prochaineLe:   champs.prochaineLe || null,
    note:(champs.note || "").trim(),
    assigneA: champs.assigneA || null
  };
  save();
  return id;
}

/* Avance une date d'une période. En mois, on ajoute des mois de calendrier :
   le 15 janvier + 3 mois donne le 15 avril, pas le 15 avril moins deux jours
   comme le ferait un +90 jours. */
export function prochaineApres(dateIso, valeur, unite){
  const d = dateFrom(dateIso);
  if(unite === "mois"){
    const jour = d.getDate();
    d.setMonth(d.getMonth() + valeur);
    /* 31 janvier + 1 mois : février n'a pas de 31, on retombe sur son dernier jour */
    if(d.getDate() !== jour) d.setDate(0);
  }else if(unite === "semaine"){
    /* Une semaine tombe toujours le même jour de la semaine — c'est tout
       l'intérêt : « le samedi » reste le samedi, là où « tous les 7 jours »
       dérivait dès qu'on cochait avec un jour de retard. */
    d.setDate(d.getDate() + valeur * 7);
  }else{
    d.setDate(d.getDate() + valeur);
  }
  return isoInput(d);
}

/* Marquer fait : consigne la date et avance l'échéance. Un rappel ponctuel ou
   un pense-bête n'a rien à avancer — il quitte la liste. */
export function marquerFait(id, dateIso){
  const r = rappels[id];
  if(!r) return;
  const le = dateIso || isoInput(new Date());
  faits[crypto.randomUUID()] = {rappelId:id, faitLe:le, note:""};
  if(r.periodeValeur) r.prochaineLe = prochaineApres(le, r.periodeValeur, r.periodeUnite);
  else delete rappels[id];
  save();
}

export function modifierRappel(id, champs){
  const r = rappels[id];
  if(!r || !champs.titre.trim()) return false;
  const periodique = champs.periodeValeur > 0;
  if(periodique && !champs.prochaineLe) return false;
  Object.assign(r, {
    titre:champs.titre.trim(), categorie:champs.categorie,
    periodeValeur: periodique ? Number(champs.periodeValeur) : null,
    periodeUnite:  periodique ? champs.periodeUnite : null,
    prochaineLe:   champs.prochaineLe || null,
    note:(champs.note || "").trim(),
    assigneA: champs.assigneA || null
  });
  save();
  return true;
}

export function supprimerRappel(id){
  delete rappels[id];
  /* l'historique part avec (la base le ferait de toute façon en cascade) */
  Object.keys(faits).forEach(k => { if(faits[k].rappelId === id) delete faits[k]; });
  save();
}

/* « Commun » d'abord : la plupart des rappels ne sont à personne en
   particulier. Le mot dit à qui la chose appartient, là où « Personne »
   se lisait comme « ce rappel n'intéresse personne ». */
function optionsPersonnes(choisi){
  return `<option value="">Commun</option>`
    + membres().map(m =>
        `<option value="${m.id}"${m.id === choisi ? " selected" : ""}>${esc(m.prenom)}</option>`).join("");
}

/* ---------- feuille de modification ---------- */
/* Retrouve l'entrée de PERIODES correspondant à un rappel, pour présélectionner
   le menu. Une périodicité inhabituelle retombe sur « Personnalisée ». */
function indexPeriode(r){
  if(!r.prochaineLe && !r.periodeValeur) return 0;
  if(!r.periodeValeur) return 1;
  const i = PERIODES.findIndex(p => p.v === r.periodeValeur && p.u === r.periodeUnite);
  return i >= 0 ? i : PERIODES.length - 1;
}

export function ouvrirEditeurRappel(id){
  const r = rappels[id];
  if(!r) return;
  const iP = indexPeriode(r);
  const perso = iP === PERIODES.length - 1;
  const n = historique(id).length;

  const optCat = Object.entries(CATEGORIES).map(([k, c]) =>
    `<option value="${k}"${k === r.categorie ? " selected" : ""}>${c.emoji} ${c.lbl}</option>`).join("");
  const optPer = PERIODES.map((p, i) =>
    `<option value="${i}"${i === iP ? " selected" : ""}>${p.lbl}</option>`).join("");
  const optQui = optionsPersonnes(r.assigneA);

  ouvrirFeuille("Modifier le rappel", `
    <label for="rmTitre">Quoi&nbsp;?</label>
    <input type="text" id="rmTitre" value="${esc(r.titre)}" autocomplete="off">
    <div class="row">
      <div><label for="rmCat">Catégorie</label><select id="rmCat">${optCat}</select></div>
      <div><label for="rmQui">Pour qui</label><select id="rmQui">${optQui}</select></div>
    </div>
    <div class="row">
      <div><label for="rmPeriode">Fréquence</label><select id="rmPeriode">${optPer}</select></div>
      <div id="rmDateBloc"><label for="rmDate" id="rmDateLbl">Prochaine fois</label>
        <input type="date" id="rmDate" value="${r.prochaineLe || ""}"></div>
    </div>
    <div class="row" id="rmPersoBloc"${perso ? "" : " hidden"}>
      <div><label for="rmPersoValeur">Tous les</label>
        <input type="number" id="rmPersoValeur" min="1" max="99" step="1"
               value="${perso ? r.periodeValeur : 2}" inputmode="numeric"></div>
      <div><label for="rmPersoUnite">Unité</label>
        <select id="rmPersoUnite">
          <option value="mois"${!perso || r.periodeUnite === "mois" ? " selected" : ""}>mois</option>
          <option value="semaine"${perso && r.periodeUnite === "semaine" ? " selected" : ""}>semaines</option>
          <option value="jour"${perso && r.periodeUnite === "jour" ? " selected" : ""}>jours</option>
        </select></div>
    </div>
    <label for="rmNote">Note</label>
    <input type="text" id="rmNote" value="${esc(r.note)}" autocomplete="off">
    ${n ? `<p class="hint" style="margin-top:10px">${n} fois consigné${n>1?"es":""} —
      la dernière le ${esc(fmtLong(dateFrom(dernierFait(id).faitLe)))}.</p>` : ""}
    <div id="rmMsg"></div>
    <div class="row"><button class="ghost danger" id="rmSuppr">Supprimer ce rappel</button></div>
  `, (ov, fermer) => {
    const majBlocs = () => {
      const c = PERIODES[$("rmPeriode").selectedIndex];
      $("rmPersoBloc").hidden = c.u !== "perso";
      $("rmDateBloc").hidden  = c.v === null;
      $("rmDateLbl").textContent = c.v === 0 ? "Quand" : "Prochaine fois";
    };
    $("rmPeriode").addEventListener("change", majBlocs);
    majBlocs();

    ov.querySelector("#rmSuppr").addEventListener("click", async () => {
      if(!await demanderConfirmation(`Supprimer « ${r.titre} » ?`,
        n ? `Son historique (${n} entrée${n>1?"s":""}) part aussi.`
          : "Ce rappel sera retiré de la liste.",
        {valider:"Supprimer", danger:true})) return;
      supprimerRappel(id);
      fermer();
      emettre("rendre");
    });

    ov.querySelector("[data-valider]").addEventListener("click", () => {
      const c = PERIODES[$("rmPeriode").selectedIndex];
      const estPerso = c.u === "perso";
      const ok = modifierRappel(id, {
        titre: $("rmTitre").value,
        categorie: $("rmCat").value,
        periodeValeur: estPerso ? $("rmPersoValeur").value : c.v,
        periodeUnite:  estPerso ? $("rmPersoUnite").value  : c.u,
        prochaineLe: c.v === null ? "" : $("rmDate").value,
        note: $("rmNote").value,
        assigneA: $("rmQui").value
      });
      if(!ok){
        $("rmMsg").innerHTML = `<p class="msg warn">Il faut un titre, et une date si le rappel en a une.</p>`;
        return;
      }
      fermer();
      emettre("rendre");
    });
  });
}

/* ---------- affichage ---------- */
function echeanceTexte(jours){
  if(jours < 0)   return {txt:`en retard de ${-jours} jour${jours < -1 ? "s" : ""}`, cls:"retard"};
  if(jours === 0) return {txt:"aujourd'hui", cls:"retard"};
  if(jours === 1) return {txt:"demain", cls:"bientot"};
  if(jours <= 14) return {txt:`dans ${jours} jours`, cls:"bientot"};
  return {txt:`dans ${jours} jours`, cls:""};
}

/* Un seul filtre à la fois, jamais deux croisés.

   Croiser catégorie ET personne donnerait, à deux comptes et cinq catégories,
   une vingtaine de combinaisons dont presque aucune ne sert : on cherche « ce
   qui est à moi » ou « ce qui concerne les chats », très rarement « ce qui est
   à moi ET concerne les chats ». Deux barres empilées coûteraient de la place
   et de la réflexion pour ce gain-là.

   Les deux familles cohabitent donc dans une seule barre, séparées d'un trait.
   Et le prénom reste affiché sur chaque ligne, quel que soit le filtre — donc
   l'information ne dépend jamais du filtre choisi.

   Valeurs : "tout" · "moi:<id>" · "commun" · une clé de CATEGORIES. */
let filtre = "tout";

export function renderRappels(){
  const box = $("rappelsListe");
  if(!box) return;
  const tous = parUrgence();
  const retard = enRetard();

  $("rappelsInfo").innerHTML = tous.length
    ? (retard ? `<strong style="color:var(--attention)">${retard} en retard</strong> · ` : "")
      + `${tous.length} au total`
    : "";

  if(!tous.length){
    $("rappelsFiltres").innerHTML = "";
    box.innerHTML = `<p class="msg">Aucun rappel — vaccins, vermifuge, croquettes,
      entretien du chauffe-eau, impôts… tout ce qui revient et qu'on oublie.</p>`;
    return;
  }

  /* Seuls les filtres qui trouvent quelque chose ont un onglet : une barre dont
     la moitié des entrées mènent au vide n'aiderait personne. */
  const compteCat = {}, compteQui = {};
  tous.forEach(([, r]) => {
    compteCat[r.categorie] = (compteCat[r.categorie] || 0) + 1;
    const cle = r.assigneA ? "moi:" + r.assigneA : "commun";
    compteQui[cle] = (compteQui[cle] || 0) + 1;
  });

  /* `groupe` marque le PREMIER bouton d'une famille : c'est lui qui porte le
     trait de séparation. Le mettre sur chacun tracerait un trait partout.

     « Commun » passe avant les prénoms, comme dans le menu « Pour qui » et comme
     dans l'agenda : ces trois listes désignent la même chose, elles n'ont aucune
     raison de la classer différemment. */
  const boutons = [{cle:"tout", lbl:"Tout", n:tous.length}];
  let debutFamille = true;
  if(compteQui["commun"]){
    boutons.push({cle:"commun", lbl:"Commun", n:compteQui["commun"], groupe:true});
    debutFamille = false;
  }
  membres().forEach(m => {
    const cle = "moi:" + m.id;
    if(!compteQui[cle]) return;
    boutons.push({cle, lbl:m.prenom, n:compteQui[cle], groupe:debutFamille});
    debutFamille = false;
  });
  debutFamille = true;
  Object.entries(CATEGORIES).filter(([k]) => compteCat[k]).forEach(([k, c]) => {
    boutons.push({cle:k, lbl:`${c.emoji} ${c.lbl}`, n:compteCat[k], groupe:debutFamille});
    debutFamille = false;
  });

  /* le filtre courant a pu disparaître : sa dernière ligne vient d'être
     supprimée, ou de changer de catégorie ou de personne */
  if(!boutons.some(b => b.cle === filtre)) filtre = "tout";

  $("rappelsFiltres").innerHTML = boutons.map(b =>
    (b.groupe ? `<span class="fsep" aria-hidden="true"></span>` : "")
    + `<button data-f="${esc(b.cle)}" aria-current="${filtre === b.cle ? "page" : "false"}">${b.lbl} ${b.n}</button>`
  ).join("");

  $("rappelsFiltres").querySelectorAll("[data-f]").forEach(b =>
    b.addEventListener("click", () => { filtre = b.dataset.f; renderRappels(); }));

  const liste =
      filtre === "tout"      ? tous
    : filtre === "commun"    ? tous.filter(([, r]) => !r.assigneA)
    : filtre.startsWith("moi:") ? tous.filter(([, r]) => r.assigneA === filtre.slice(4))
    : tous.filter(([, r]) => r.categorie === filtre);

  /* Quatre moments, dans l'ordre où ils réclament quelque chose. Une liste plate
     de neuf rappels laisse chercher lequel est en retard ; ces intertitres le
     disent avant qu'on ait lu une seule ligne. Un groupe vide ne s'affiche pas —
     un intertitre sans rien dessous ne fait qu'allonger l'écran. */
  const GROUPES = [
    {cle:"retard",   titre:"En retard"},
    {cle:"semaine",  titre:"Cette semaine"},
    {cle:"tard",     titre:"Plus tard"},
    {cle:"sansdate", titre:"Sans date"}
  ];
  /* « Cette semaine » est la semaine du calendrier — jusqu'à dimanche soir — et
     non les sept prochains jours. La différence compte : un mercredi, sept jours
     glissants rangeaient le mardi suivant dans « cette semaine », alors qu'il
     appartient à la semaine d'après. Conséquence assumée : le dimanche, le
     groupe ne contient plus que la journée en cours. */
  const dimanche = (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (6 - (d.getDay() + 6) % 7));   /* lundi = 0 … dimanche = 6 */
    return isoInput(d);
  })();

  const groupeDe = r => {
    if(!r.prochaineLe) return "sansdate";
    if(joursAvant(r.prochaineLe) < 0) return "retard";
    return r.prochaineLe <= dimanche ? "semaine" : "tard";
  };

  const ligneRappel = (id, r, urgent) => {
    const cat = CATEGORIES[r.categorie] || CATEGORIES.autre;
    const dernier = dernierFait(id);
    /* sans date, la périodicité n'a rien à ajouter — inutile de répéter « sans date » */
    let quand;
    if(r.prochaineLe){
      const e = echeanceTexte(joursAvant(r.prochaineLe));
      quand = `<span class="ech ${e.cls}">${esc(e.txt)}</span> · ${esc(fmtLong(dateFrom(r.prochaineLe)))}`
            + ` · ${esc(libellePeriode(r))}`;
    }else{
      quand = `<span class="ech sansdate">sans date</span>`;
    }
    /* le prénom reste visible quel que soit le filtre : l'information ne doit
       pas dépendre de la vue choisie */
    const qui = prenomDe(r.assigneA);
    /* Titre et prénom sont enfermés ensemble dans « ctitre » : « clib » empile
       ses enfants en colonne, un prénom posé à côté du titre y tomberait à la
       ligne suivante. */
    return `<li class="citem${urgent ? " urgent" : ""}" data-rap="${id}" role="button" tabindex="0">
      <span class="emo" data-cat="${esc(r.categorie)}" title="${esc(cat.lbl)}">${cat.emoji}</span>
      <span class="clib">
        <span class="ctitre">${esc(r.titre)}${qui ? `<span class="qui">${esc(qui)}</span>` : ""}</span>
        <small class="par">${quand}</small>
        ${dernier ? `<small class="par">dernière fois le ${esc(fmtLong(dateFrom(dernier.faitLe)))}</small>` : ""}
        ${r.note ? `<small class="par">${esc(r.note)}</small>` : ""}</span>
      <button class="ghost fait" data-fait="${id}">Fait</button>
    </li>`;
  };

  box.innerHTML = GROUPES.map(g => {
    const dedans = liste.filter(([, r]) => groupeDe(r) === g.cle);
    if(!dedans.length) return "";
    return `<div class="lmois">${g.titre}</div>`
      + `<ul class="clist">${dedans.map(([id, r]) =>
           ligneRappel(id, r, g.cle === "retard")).join("")}</ul>`;
  }).join("")
  || `<p class="msg">Aucun rappel ne correspond à ce filtre.</p>`;

  /* « Fait » d'abord : sans le stopPropagation, il ouvrirait aussi l'éditeur. */
  /* « Fait » d'abord : sans le stopPropagation, il ouvrirait aussi l'éditeur.
     La date se choisit dans un champ date natif — la saisie libre d'un
     `prompt()` obligeait à vérifier le format derrière, et ne s'affichait de
     toute façon pas sur un téléphone. */
  box.querySelectorAll("[data-fait]").forEach(b =>
    b.addEventListener("click", async e => {
      e.stopPropagation();
      const id = b.dataset.fait;
      const r = rappels[id];
      const quand = await demanderValeur(`« ${r.titre} », c'était quand ?`, {
        label: "Date", type: "date", valeur: isoInput(new Date()),
        obligatoire: "Il faut une date pour consigner ce rappel."
      });
      if(quand === null) return;
      marquerFait(id, quand);
      emettre("rendre");
    }));

  box.querySelectorAll("[data-rap]").forEach(li => {
    const ouvrir = () => ouvrirEditeurRappel(li.dataset.rap);
    li.addEventListener("click", ouvrir);
    li.addEventListener("keydown", e => { if(e.key === "Enter") ouvrir(); });
  });
}

/* Le formulaire s'adapte au type choisi : une date n'a de sens que pour un
   rappel daté, la saisie libre que pour une périodicité personnalisée. */
function majFormulaire(){
  const choix = PERIODES[$("rapPeriode").selectedIndex];
  const perso = choix.u === "perso";
  const dateUtile = choix.v !== null;          /* « aucune date » est la seule option sans date */
  $("rapPersoBloc").hidden = !perso;
  $("rapDateBloc").hidden  = !dateUtile;
  $("rapDateLbl").textContent = choix.v === 0 ? "Quand" : "Prochaine fois";
}

/* Le menu des personnes se remplit après la connexion : au câblage, le foyer
   n'est pas encore chargé. */
export function majPersonnes(){
  const sel = $("rapQui");
  if(sel) sel.innerHTML = optionsPersonnes(sel.value);
}

/* Le formulaire d'ajout est replié par défaut : la question qu'on se pose en
   arrivant ici est « qu'est-ce qui arrive ? », pas « qu'est-ce que j'ajoute ? ».
   Le « + » de l'en-tête l'ouvre, et l'ajout réussi le referme. */
function ouvrirFormulaire(ouvert){
  const form = $("rapForm"), btn = $("rapNouveau");
  form.hidden = !ouvert;
  btn.setAttribute("aria-expanded", String(ouvert));
  btn.textContent = ouvert ? "×" : "+";
  if(ouvert) $("rapTitre").focus();
}

export function brancherRappels(){
  $("rapCat").innerHTML = Object.entries(CATEGORIES).map(([k, c]) =>
    `<option value="${k}"${k === "maison" ? " selected" : ""}>${c.emoji} ${c.lbl}</option>`).join("");
  majPersonnes();
  $("rapPeriode").innerHTML = PERIODES.map((p, i) =>
    `<option value="${i}"${p.v === 3 ? " selected" : ""}>${p.lbl}</option>`).join("");
  $("rapPeriode").addEventListener("change", majFormulaire);
  majFormulaire();

  $("rapNouveau").addEventListener("click", () => ouvrirFormulaire($("rapForm").hidden));

  $("rapAjout").addEventListener("click", () => {
    const choix = PERIODES[$("rapPeriode").selectedIndex];
    const perso = choix.u === "perso";
    const id = ajouterRappel({
      titre: $("rapTitre").value,
      categorie: $("rapCat").value,
      periodeValeur: perso ? $("rapPersoValeur").value : choix.v,
      periodeUnite:  perso ? $("rapPersoUnite").value  : choix.u,
      prochaineLe: choix.v === null ? "" : $("rapDate").value,
      note: $("rapNote").value,
      assigneA: $("rapQui").value
    });
    if(!id){
      $("rapMsg").innerHTML = `<p class="msg warn">Il faut un titre, et une date si le rappel en a une.</p>`;
      return;
    }
    ["rapTitre","rapNote"].forEach(i => $(i).value = "");
    $("rapMsg").innerHTML = "";
    ouvrirFormulaire(false);
    emettre("rendre");
  });

  $("rapTitre").addEventListener("keydown", e => {
    if(e.key === "Enter"){ e.preventDefault(); $("rapAjout").click(); }
  });

  $("rapDate").value = isoInput(new Date());
}
