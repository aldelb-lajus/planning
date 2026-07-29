/* Briques d'interface communes à tous les modules. */

export const $ = id => document.getElementById(id);

export const esc = s => String(s).replace(/[&<>"]/g, m =>
  ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"}[m]));

/* Téléchargement d'un contenu produit dans le navigateur (.ics, sauvegarde .json…). */
export function download(txt, name, mime){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], {type: mime || "text/calendar"}));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* Navigation à deux niveaux.

   Barre du bas : les USAGES (courses, planning, et demain agenda, échéances).
   Sous-barre    : les sections d'un usage (le planning, importer, exporter, codes).

   La règle qui tient l'ensemble : une opération qui n'a de sens que pour un
   module reste dans ce module. Sans elle, la barre du bas déborde dès le
   troisième usage, et on ne sait plus ce qui dépend de quoi. */

export function showTab(name){
  document.querySelectorAll(".tab").forEach(s => s.hidden = s.dataset.tab !== name);
  document.querySelectorAll(".tabs button").forEach(b =>
    b.setAttribute("aria-current", b.dataset.tab === name ? "page" : "false"));
  window.scrollTo(0, 0);
}

/* `portee` limite la recherche à un onglet : deux modules peuvent avoir des
   sous-sections de même nom sans se marcher dessus. */
export function showSub(portee, nom){
  portee.querySelectorAll(".subtab").forEach(s => s.hidden = s.dataset.sub !== nom);
  portee.querySelectorAll(".subtabs button").forEach(b =>
    b.setAttribute("aria-current", b.dataset.sub === nom ? "page" : "false"));
  window.scrollTo(0, 0);
}

export function brancherOnglets(){
  document.querySelectorAll(".tabs button").forEach(b =>
    b.addEventListener("click", () => showTab(b.dataset.tab)));

  document.querySelectorAll(".subtabs").forEach(barre => {
    const portee = barre.closest(".tab") || document;
    barre.querySelectorAll("button").forEach(b =>
      b.addEventListener("click", () => showSub(portee, b.dataset.sub)));
  });
}

/* Feuille modale (choix d'un poste, plus tard choix d'un produit…).
   `contenu` est le HTML intérieur ; `apres` reçoit la feuille pour y brancher
   les événements. Rien n'est écrit tant que l'appelant ne le fait pas. */
export function ouvrirFeuille(titre, contenu, apres){
  const ov = document.createElement("div");
  ov.className = "sheet-ov";
  ov.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(titre)}">
    <p class="sheet-h">${esc(titre)}</p>
    ${contenu}
    <div class="btns" style="justify-content:flex-end;margin-top:14px">
      <button class="ghost" data-annuler="1">Annuler</button>
      <button data-valider="1">Valider</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const fermer = () => ov.remove();
  ov.querySelector("[data-annuler]").addEventListener("click", fermer);
  ov.addEventListener("click", e => { if(e.target === ov) fermer(); });  /* tap hors de la feuille = annuler */
  apres(ov, fermer);
  return ov;
}

/* ---------- confirmer, demander une valeur ----------

   Ces deux fonctions remplacent `confirm()` et `prompt()`. Ce n'est pas une
   question de style : les boîtes natives sont **indisponibles** ici. Mesuré
   dans le navigateur, pas supposé — `prompt()` lève « prompt() is not
   supported », et `confirm()` rend `false` en 2 ms sans rien afficher.

   Conséquence, et c'est le vrai dégât : tout le code écrit
   `if(!confirm(…)) return;`. Un `false` immédiat annulait donc en silence
   « Fait », « Terminer les courses », « Se déconnecter » et toutes les
   suppressions. Rien ne se passait, rien ne le disait.

   Les deux rendent une promesse : `await` côté appelant, et le geste ne part
   qu'une fois la feuille validée. */

export function demanderConfirmation(titre, texte, opts = {}){
  return new Promise(resolve => {
    /* La feuille se ferme par trois chemins — Valider, Annuler, tap dehors —
       et une promesse ne se résout qu'une fois. */
    let repondu = false;
    const finir = v => { if(!repondu){ repondu = true; resolve(v); } };
    const lignes = String(texte || "").split("\n").filter(Boolean)
      .map(l => `<p class="msg">${esc(l)}</p>`).join("");

    ouvrirFeuille(titre, lignes, (ov, fermer) => {
      const ok = ov.querySelector("[data-valider]");
      ok.textContent = opts.valider || "Confirmer";
      if(opts.danger) ok.classList.add("ghost", "danger");
      ok.addEventListener("click", () => { finir(true); fermer(); });
      ov.querySelector("[data-annuler]").addEventListener("click", () => finir(false));
      ov.addEventListener("click", e => { if(e.target === ov) finir(false); });
    });
  });
}

/* Rend la valeur saisie, ou null si on renonce — comme `prompt()`, pour que les
   appelants gardent leur forme. `type` accepte "text", "date"… : un champ date
   natif vaut mieux qu'une date tapée à la main, et supprime au passage la
   vérification du format qu'il fallait faire derrière `prompt()`. */
export function demanderValeur(titre, opts = {}){
  return new Promise(resolve => {
    let repondu = false;
    const finir = v => { if(!repondu){ repondu = true; resolve(v); } };

    ouvrirFeuille(titre, `
      ${opts.label ? `<label for="fSaisie">${esc(opts.label)}</label>` : ""}
      <input type="${esc(opts.type || "text")}" id="fSaisie" value="${esc(opts.valeur || "")}"
             ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ""} autocomplete="off">
      <div id="fMsg"></div>
    `, (ov, fermer) => {
      const champ = ov.querySelector("#fSaisie");
      champ.focus();
      if((opts.type || "text") === "text") champ.select();

      const valider = () => {
        const v = champ.value.trim();
        if(!v && opts.obligatoire){
          ov.querySelector("#fMsg").innerHTML = `<p class="msg warn">${esc(opts.obligatoire)}</p>`;
          return;
        }
        finir(v);
        fermer();
      };
      ov.querySelector("[data-valider]").addEventListener("click", valider);
      champ.addEventListener("keydown", e => {
        if(e.key === "Enter"){ e.preventDefault(); valider(); }
      });
      ov.querySelector("[data-annuler]").addEventListener("click", () => finir(null));
      ov.addEventListener("click", e => { if(e.target === ov) finir(null); });
    });
  });
}
