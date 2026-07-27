/* Correspondance entre la liste de courses et ses deux tables.

   Ce fichier est volontairement court : tout le travail de synchronisation est
   fait par js/noyau/sync.js, écrit pour la phase précédente. C'est exactement
   ce qu'on attendait du découpage — un module de plus ne coûte qu'une
   description de ses tables. */

import {creerSync} from "../noyau/sync.js";
import * as C from "./modele.js";

/* course_frequent n'est cité par personne : l'ordre entre les deux est libre. */
const collections = [
  {
    nom:"items", table:"course_item", cle:"id",
    colonnes:"id, liste, libelle, quantite, rayon, coche_le, coche_par, cree_le, cree_par",
    donnees:   () => C.items,
    remplacer: o  => C.remplacerItems(o),
    versLigne: (id, a) => ({
      id, liste:a.liste, libelle:a.libelle,
      quantite:a.quantite || "", rayon:a.rayon || "",
      coche_le:a.cocheLe || null, coche_par:a.cochePar || null,
      cree_le:a.creeLe
    }),
    depuisLigne: r => [r.id, {
      liste:r.liste, libelle:r.libelle,
      quantite:r.quantite || "", rayon:r.rayon || "",
      cocheLe:r.coche_le, cochePar:r.coche_par,
      creeLe:r.cree_le, creePar:r.cree_par
    }]
  },
  {
    nom:"frequents", table:"course_frequent", cle:"libelle",
    colonnes:"libelle, rayon, utilisations, dernier_le",
    donnees:   () => C.frequents,
    remplacer: o  => C.remplacerFrequents(o),
    versLigne: (lib, f) => ({
      libelle:lib, rayon:f.rayon || "",
      utilisations:f.utilisations, dernier_le:f.dernierLe
    }),
    depuisLigne: r => [r.libelle, {
      rayon:r.rayon || "", utilisations:r.utilisations, dernierLe:r.dernier_le
    }]
  }
];

export function creerSyncCourses({statut, apresLecture}){
  return creerSync({
    collections,
    statut,
    apresLecture(){ C.ecrireCache(); apresLecture(); }
  });
}
