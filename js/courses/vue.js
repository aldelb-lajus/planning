/* Onglet Courses.

   Trois partis pris, tous destinés à un usage debout dans un magasin :
     - cocher barre l'article et le range dans « Pris », sans jamais le supprimer
     - la liste ne se vide qu'au bouton « Terminer les courses »
     - toute suppression laisse 5 secondes pour revenir en arrière

   Aucune suppression au glissement du doigt : c'est la fausse manip type. */

import {$, esc} from "../noyau/ui.js";
import {emettre} from "../noyau/signal.js";
import {monId, prenomDe} from "../noyau/supabase.js";
import * as C from "./modele.js";

let prisReplies = true;      // la section « Pris » démarre repliée
let minuteurSursis = null;

/* ---------- bandeau d'annulation ---------- */
function proposerAnnulation(texte, action){
  clearTimeout(minuteurSursis);
  const box = $("coursesUndo");
  box.innerHTML = `<span>${esc(texte)}</span><button class="ghost" id="undoBtn">Annuler</button>`;
  box.hidden = false;

  const finir = () => { box.hidden = true; box.innerHTML = ""; };
  $("undoBtn").addEventListener("click", () => {
    clearTimeout(minuteurSursis);
    action.annuler();
    finir();
  });
  minuteurSursis = setTimeout(() => { action.confirmer(); finir(); }, 5000);
}

/* ---------- rendu ---------- */
function ligne(id, a, pris){
  const qui = pris ? prenomDe(a.cochePar) : prenomDe(a.creePar);
  const mention = qui ? `<small class="par">${pris ? "pris" : "ajouté"} par ${esc(qui)}</small>` : "";
  return `<li class="citem${pris ? " pris" : ""}" data-id="${id}">
    <button class="coche" data-coche="${id}" aria-pressed="${pris}"
            aria-label="${pris ? "Remettre" : "Marquer comme pris"} ${esc(a.libelle)}">${pris ? "✓" : ""}</button>
    <span class="clib" data-editer="${id}" role="button" tabindex="0">${esc(a.libelle)}${mention}</span>
    <button class="csuppr" data-suppr="${id}" aria-label="Supprimer ${esc(a.libelle)}">✕</button>
  </li>`;
}

export function renderCourses(){
  const aPrendre = C.articles(false);
  const pris     = C.articles(true);
  const sugg     = C.suggestions();

  $("coursesSugg").innerHTML = sugg.length
    ? `<p class="hint" style="margin:10px 0 6px">Déjà achetés — appuie pour rajouter&nbsp;:</p>
       <div class="chips">${sugg.map(s =>
         `<button class="chip-sugg" data-sugg="${esc(s.libelle)}">${esc(s.libelle)}</button>`).join("")}</div>`
    : "";

  $("coursesListe").innerHTML = aPrendre.length
    ? `<ul class="clist">${aPrendre.map(([id, a]) => ligne(id, a, false)).join("")}</ul>`
    : `<p class="msg">Liste vide — ajoute un article ci-dessus.</p>`;

  $("coursesPris").innerHTML = pris.length
    ? `<button class="replier" id="basculePris" aria-expanded="${!prisReplies}">
         ${prisReplies ? "▸" : "▾"} Pris (${pris.length})
       </button>
       <div id="prisCorps"${prisReplies ? " hidden" : ""}>
         <ul class="clist">${pris.map(([id, a]) => ligne(id, a, true)).join("")}</ul>
         <button id="finirCourses">Terminer les courses</button>
         <p class="hint">Vide les ${pris.length} article${pris.length>1?"s":""} pris et les ajoute
           aux suggestions pour la prochaine fois.</p>
       </div>`
    : "";

  const total = aPrendre.length;
  $("coursesInfo").textContent = total
    ? total + " article" + (total>1?"s":"") + " à prendre"
    : (pris.length ? "Tout est pris." : "");

  brancherLignes();
}

function brancherLignes(){
  document.querySelectorAll("[data-coche]").forEach(b =>
    b.addEventListener("click", () => {
      const id = b.dataset.coche;
      C.cocher(id, !C.items[id].cocheLe, monId());
      emettre("rendre");
    }));

  document.querySelectorAll("[data-suppr]").forEach(b =>
    b.addEventListener("click", () => {
      const id = b.dataset.suppr;
      const libelle = C.items[id].libelle;
      const action = C.supprimerPlusTard(id);
      if(action) proposerAnnulation(`« ${libelle} » supprimé.`, action);
    }));

  document.querySelectorAll("[data-editer]").forEach(el => {
    const ouvrir = () => {
      const id = el.dataset.editer;
      const nouveau = prompt("Renommer l'article :", C.items[id].libelle);
      if(nouveau !== null){ C.renommer(id, nouveau); emettre("rendre"); }
    };
    el.addEventListener("dblclick", ouvrir);
    el.addEventListener("keydown", e => { if(e.key === "Enter") ouvrir(); });
  });

  document.querySelectorAll("[data-sugg]").forEach(b =>
    b.addEventListener("click", () => { C.ajouter(b.dataset.sugg); emettre("rendre"); }));

  const bascule = $("basculePris");
  if(bascule) bascule.addEventListener("click", () => {
    prisReplies = !prisReplies;
    renderCourses();
  });

  const finir = $("finirCourses");
  if(finir) finir.addEventListener("click", () => {
    const n = C.articles(true).length;
    if(!confirm(`Vider les ${n} article${n>1?"s":""} pris ?\nIls resteront proposés en suggestion.`)) return;
    C.terminerLesCourses();
    emettre("rendre");
  });
}

export function brancherCourses(){
  const champ = $("coursesAjout");
  const ajouter = () => {
    const v = champ.value.trim();
    if(!v) return;
    /* une virgule permet d'en saisir plusieurs d'un coup : « lait, pain, œufs » */
    v.split(",").map(s => s.trim()).filter(Boolean).forEach(s => C.ajouter(s));
    champ.value = "";
    emettre("rendre");
    champ.focus();
  };
  $("coursesAjoutBtn").addEventListener("click", ajouter);
  champ.addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); ajouter(); } });
}
