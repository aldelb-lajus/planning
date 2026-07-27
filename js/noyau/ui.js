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
