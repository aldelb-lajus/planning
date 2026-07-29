/* Carnet d'idées d'évolution de l'appli.

   Un module entier — modèle, correspondance des tables, affichage — en un seul
   fichier, parce qu'il est petit. Découper est utile quand ça sert ; ici ça
   n'apporterait que des allers-retours entre fichiers. */

import {$, esc, demanderConfirmation} from "../noyau/ui.js";
import {emettre} from "../noyau/signal.js";
import {store, emballer} from "../noyau/store.js";
import {creerSync} from "../noyau/sync.js";
import {monId, prenomDe} from "../noyau/supabase.js";

export let idees = {};   // id -> {texte, statut, creeLe, creePar}

const save = () => { store.set("idees:liste", emballer(idees)); emettre("modifie"); };
export const remplacerIdees = o => { idees = o || {}; };

/* ---------- synchronisation ---------- */
export function creerSyncIdees({statut, apresLecture}){
  return creerSync({
    collections: [{
      nom:"idees", table:"idee", cle:"id",
      colonnes:"id, texte, statut, cree_le, cree_par",
      donnees:   () => idees,
      remplacer: o  => remplacerIdees(o),
      versLigne:   (id, i) => ({id, texte:i.texte, statut:i.statut, cree_le:i.creeLe}),
      depuisLigne: r => [r.id, {texte:r.texte, statut:r.statut, creeLe:r.cree_le, creePar:r.cree_par}]
    }],
    statut,
    apresLecture(){
      store.set("idees:liste", emballer(idees));
      apresLecture();
    }
  });
}

/* ---------- écriture ---------- */
export function ajouterIdee(texte){
  const t = texte.trim();
  if(!t) return;
  idees[crypto.randomUUID()] = {
    texte:t, statut:"a_faire", creeLe:new Date().toISOString(), creePar:monId()
  };
  save();
}

export function basculerIdee(id){
  const i = idees[id];
  if(!i) return;
  i.statut = i.statut === "faite" ? "a_faire" : "faite";
  save();
}

export function supprimerIdee(id){
  delete idees[id];
  save();
}

/* ---------- affichage ---------- */
export function renderIdees(){
  const box = $("ideesListe");
  if(!box) return;

  /* à faire d'abord, puis les plus récentes en tête : une idée notée ce matin
     doit être sous les yeux, pas au fond de la liste */
  const liste = Object.entries(idees).sort((a, b) => {
    const fa = a[1].statut === "faite", fb = b[1].statut === "faite";
    if(fa !== fb) return fa ? 1 : -1;
    return (b[1].creeLe || "").localeCompare(a[1].creeLe || "");
  });

  box.innerHTML = liste.length
    ? `<ul class="clist">${liste.map(([id, i]) => {
        const faite = i.statut === "faite";
        const qui = prenomDe(i.creePar);
        const date = i.creeLe ? new Date(i.creeLe).toLocaleDateString("fr-FR",
          {day:"numeric", month:"short"}) : "";
        const mention = [qui, date].filter(Boolean).join(" · ");
        return `<li class="citem${faite ? " pris" : ""}" data-id="${id}">
          <button class="coche" data-idee-coche="${id}" aria-pressed="${faite}"
                  aria-label="${faite ? "Remettre en attente" : "Marquer comme faite"}">${faite ? "✓" : ""}</button>
          <span class="clib">${esc(i.texte)}${mention ? `<small class="par">${esc(mention)}</small>` : ""}</span>
          <button class="csuppr" data-idee-suppr="${id}" aria-label="Supprimer cette idée">✕</button>
        </li>`;
      }).join("")}</ul>`
    : `<p class="msg">Aucune idée notée. Écris ce qui te passe par la tête —
       ça se trie plus tard.</p>`;

  box.querySelectorAll("[data-idee-coche]").forEach(b =>
    b.addEventListener("click", () => { basculerIdee(b.dataset.ideeCoche); emettre("rendre"); }));
  box.querySelectorAll("[data-idee-suppr]").forEach(b =>
    b.addEventListener("click", async () => {
      if(!await demanderConfirmation("Supprimer cette idée ?",
        "Elle disparaîtra pour les deux comptes.", {valider:"Supprimer", danger:true})) return;
      supprimerIdee(b.dataset.ideeSuppr);
      emettre("rendre");
    }));
}

export function brancherIdees(){
  const champ = $("ideeTexte");
  const ajouter = () => {
    if(!champ.value.trim()) return;
    ajouterIdee(champ.value);
    champ.value = "";
    emettre("rendre");
    champ.focus();
  };
  $("ideeBtn").addEventListener("click", ajouter);
  champ.addEventListener("keydown", e => {
    /* Entrée valide, Maj+Entrée passe à la ligne : une idée tient souvent en
       une phrase, parfois en trois. */
    if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); ajouter(); }
  });
}
