/* Synchronisation différentielle avec la base.

   Principe : on garde une photo de ce que contient la base. À l'envoi, on ne
   transmet que les lignes dont l'état a changé depuis cette photo. Deux
   personnes qui modifient deux lignes différentes ne s'écrasent donc jamais —
   c'est tout l'intérêt par rapport à un fichier unique réécrit en entier.

   Rien ici ne connaît le planning : ce moteur sert aussi bien aux courses, à
   l'agenda ou aux échéances. Chaque module lui décrit ses tables sous forme de
   « collections » :

     nom          identifiant interne
     table        table Supabase
     cle          colonne clé primaire
     colonnes     colonnes à lire (défaut : toutes)
     depuisLigne  (ligne) -> [cle, valeur]   base    -> appli
     versLigne    (cle, valeur) -> ligne     appli   -> base
     versCle      (cle) -> valeur en base    facultatif, quand la clé de l'appli
                                             ne s'écrit pas comme celle de la base
     donnees      () -> objet {cle: valeur} courant côté appli
     remplacer    (objet) -> void            écrase l'état côté appli

   L'ORDRE des collections compte : une table citée par une autre doit venir
   avant elle. Les écritures suivent cet ordre, les suppressions le remontent. */

import {sb} from "./supabase.js";
import {hhmmMaintenant} from "./dates.js";

const identique = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const copie = o => JSON.parse(JSON.stringify(o));

export function creerSync({collections, statut = () => {}, apresLecture = () => {}}){
  let connu = {};                      // nom -> photo de la base
  let minuteur = null, occupe = false, canal = null;

  async function lire(){
    const reps = await Promise.all(
      collections.map(c => sb.from(c.table).select(c.colonnes || "*")));
    reps.forEach(r => { if(r.error) throw r.error; });

    collections.forEach((c, i) => {
      const obj = {};
      reps[i].data.forEach(ligne => { const [k, v] = c.depuisLigne(ligne); obj[k] = v; });
      c.remplacer(obj);
      connu[c.nom] = copie(obj);
    });
    apresLecture();
  }

  async function ecrire(){
    const aEcrire = [], aSupprimer = [];
    for(const c of collections){
      const courant = c.donnees(), photo = connu[c.nom] || {};
      const maj = Object.keys(courant).filter(k => !identique(courant[k], photo[k]));
      const sup = Object.keys(photo).filter(k => !(k in courant));
      if(maj.length) aEcrire.push({c, lignes: maj.map(k => c.versLigne(k, courant[k]))});
      if(sup.length) aSupprimer.push({c, cles: sup});
    }
    if(!aEcrire.length && !aSupprimer.length) return false;

    /* Écritures des tables citées vers celles qui citent, suppressions dans
       l'autre sens : une ligne peut ainsi lâcher sa référence (mise à NULL)
       avant que la ligne référencée disparaisse. */
    for(const {c, lignes} of aEcrire){
      const {error} = await sb.from(c.table).upsert(lignes);
      if(error) throw error;
    }
    for(const {c, cles} of [...aSupprimer].reverse()){
      /* les clés repassent par versCle : côté appli un jour s'écrit "20260729",
         côté base c'est une date "2026-07-29" — sans conversion, la suppression
         ne trouverait aucune ligne et échouerait en silence */
      const enBase = c.versCle ? cles.map(c.versCle) : cles;
      const {error} = await sb.from(c.table).delete().in(c.cle, enBase);
      if(error) throw error;
    }

    collections.forEach(c => connu[c.nom] = copie(c.donnees()));
    return true;
  }

  async function maintenant(lireDabord){
    if(occupe) return;
    occupe = true;
    try{
      if(lireDabord) await lire();
      const envoye = await ecrire();
      statut(envoye ? "Enregistré pour tout le monde à " + hhmmMaintenant() + "."
                    : "À jour (" + hhmmMaintenant() + ").");
    }catch(e){
      if(!navigator.onLine)
        statut("Hors ligne — tes modifications sont gardées ici et partiront au retour du réseau.", true);
      else if(e && (e.code === "42501" || String(e.message || "").includes("row-level security")))
        statut("Ton compte n'a pas le droit de modifier ces données (rôle « enfant »).", true);
      else
        statut("Enregistrement impossible (" + (e.message || e) + ") — nouvel essai plus tard.", true);
    }
    occupe = false;
  }

  function planifier(delai = 1500, lireDabord = false){
    clearTimeout(minuteur);
    minuteur = setTimeout(() => { minuteur = null; maintenant(lireDabord); }, delai);
  }

  /* Temps réel : la modification faite sur un autre appareil arrive toute seule.
     L'écoute est limitée aux tables de ce jeu de collections — sans ce filtre,
     ajouter un article aux courses relancerait aussi la synchro du planning. */
  function ecouter(){
    if(canal) return;
    canal = sb.channel("sync-" + collections.map(c => c.table).join("-"));
    collections.forEach(c =>
      canal.on("postgres_changes", {event:"*", schema:"public", table:c.table},
               () => planifier(800, true)));
    canal.subscribe();
  }

  return {lire, ecrire, maintenant, planifier, ecouter};
}
