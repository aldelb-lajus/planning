/* Correspondance entre le planning et ses trois tables Supabase.

   Tout ce que le moteur de synchronisation a besoin de savoir sur le planning
   tient ici : quelles tables, et comment passer d'une ligne à l'objet manipulé
   par l'appli. Le module suivant (courses, agenda…) écrira son propre fichier
   de ce genre, et réutilisera le même moteur. */

import {creerSync} from "../noyau/sync.js";
import * as M from "./modele.js";

/* "08:00:00" venant de la base -> "08:00" attendu par les champs horaires */
const hm      = t => t ? String(t).slice(0,5) : "";
/* "" saisi dans l'appli -> NULL en base */
const tOrNull = t => t ? t : null;

const cleOf  = d => String(d).replaceAll("-","");                       // "2026-07-27" -> "20260727"
const dateOf = k => k.slice(0,4)+"-"+k.slice(4,6)+"-"+k.slice(6,8);

/* L'ordre compte : poste_jour cite poste_code, donc poste_code vient d'abord. */
const collections = [
  {
    nom:"codes", table:"poste_code", cle:"code",
    donnees:   () => M.ref,
    remplacer: o  => M.remplacerRef(o),
    versLigne: (c, k) => ({
      code:c, libelle:k.libelle || "", type:k.type,
      debut:tOrNull(k.debut),   fin:tOrNull(k.fin),
      debut2:tOrNull(k.debut2), fin2:tOrNull(k.fin2),
      no_reveil1: !!k.noReveil1
    }),
    depuisLigne: r => {
      const k = {libelle:r.libelle || "", type:r.type, debut:hm(r.debut), fin:hm(r.fin)};
      /* debut2 n'est ajouté que s'il existe : l'affichage teste « "debut2" in k »
         pour décider de montrer la ligne du 2e créneau. */
      if(r.debut2){ k.debut2 = hm(r.debut2); k.fin2 = hm(r.fin2); }
      if(r.no_reveil1) k.noReveil1 = true;
      return [r.code, k];
    }
  },
  {
    nom:"jours", table:"poste_jour", cle:"jour", colonnes:"jour, code",
    donnees:   () => M.jours,
    remplacer: o  => M.remplacerJours(o),
    versLigne:   (k, code) => ({jour: dateOf(k), code: code || null}),
    versCle:     dateOf,          /* "20260729" côté appli -> "2026-07-29" en base */
    depuisLigne: r => [cleOf(r.jour), r.code || ""]
  },
  {
    nom:"reglages", table:"reglage", cle:"cle", colonnes:"cle, valeur",
    donnees:   () => ({lead: M.prefs.lead, calName: M.prefs.calName}),
    remplacer: o  => M.remplacerPrefs(o),
    versLigne:   (cle, valeur) => ({cle, valeur}),
    depuisLigne: r => [r.cle, r.valeur]
  }
];

export function creerSyncPlanning({statut, apresLecture}){
  return creerSync({
    collections,
    statut,
    apresLecture(){
      M.migrate();
      /* La photo de la base est déjà prise par le moteur : purger ensuite fait
         apparaître les jours trop vieux comme retirés, et l'envoi suivant les
         efface aussi de la base — sinon ils s'y accumuleraient sans fin. */
      const purge = M.pruneJours(M.jours);
      M.ecrireCache();
      apresLecture(purge);
    }
  });
}
