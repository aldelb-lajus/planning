/* La liste de courses et ses règles.

   Règle centrale, dont tout le reste découle : **cocher ne supprime jamais**.
   Un article coché reste en base, se barre, et descend dans « Pris ». Il ne
   disparaît qu'au geste explicite de fin de courses. Dans un magasin, sur un
   téléphone, à une main, la suppression immédiate est une fausse manip qui
   attend son heure. */

import {store, emballer} from "../noyau/store.js";
import {emettre} from "../noyau/signal.js";

export let items = {};      // id -> {liste, libelle, quantite, rayon, cocheLe, cochePar, creePar}
export let frequents = {};  // libellé -> {rayon, utilisations, dernierLe}

export const LISTE_PAR_DEFAUT = "courses";

/* Suppressions en sursis : l'article quitte l'affichage tout de suite, mais
   n'est réellement retiré qu'à l'expiration du délai d'annulation. Rien n'est
   donc envoyé à la base tant que le « Annuler » est encore proposé. */
export const enSursis = new Set();

export const saveItems = () => { store.set("courses:items", emballer(items)); emettre("modifie"); };
export const saveFrequents = () => { store.set("courses:frequents", emballer(frequents)); emettre("modifie"); };

export function ecrireCache(){
  store.set("courses:items", emballer(items));
  store.set("courses:frequents", emballer(frequents));
}

export const remplacerItems     = o => { items = o || {}; };
export const remplacerFrequents = o => { frequents = o || {}; };

/* ---------- lecture ---------- */
const norm = s => s.trim().toLowerCase();

/* Articles d'une liste, hors suppressions en sursis. `pris` filtre sur l'état. */
export function articles(pris, liste = LISTE_PAR_DEFAUT){
  return Object.entries(items)
    .filter(([id, a]) => a.liste === liste && !enSursis.has(id) && !!a.cocheLe === pris)
    .sort((a, b) => (a[1].creeLe || "").localeCompare(b[1].creeLe || ""));
}

/* Suggestions : les produits les plus repris, jamais ceux déjà dans la liste. */
export function suggestions(n = 8, liste = LISTE_PAR_DEFAUT){
  const dedans = new Set(Object.values(items)
    .filter(a => a.liste === liste).map(a => norm(a.libelle)));
  return Object.entries(frequents)
    .filter(([lib]) => !dedans.has(norm(lib)))
    .sort((a, b) => b[1].utilisations - a[1].utilisations
                 || (b[1].dernierLe || "").localeCompare(a[1].dernierLe || ""))
    .slice(0, n)
    .map(([lib, f]) => ({libelle: lib, rayon: f.rayon}));
}

/* ---------- écriture ---------- */

/* Ajout. Un libellé déjà présent et non coché n'est pas dupliqué : c'est le
   réflexe de deux personnes qui pensent au lait en même temps. */
export function ajouter(libelle, liste = LISTE_PAR_DEFAUT){
  const lib = libelle.trim();
  if(!lib) return null;
  const doublon = Object.entries(items).find(([id, a]) =>
    a.liste === liste && !a.cocheLe && !enSursis.has(id) && norm(a.libelle) === norm(lib));
  if(doublon) return doublon[0];

  const id = crypto.randomUUID();
  items[id] = {
    liste, libelle: lib, quantite: "", rayon: (frequents[lib] || {}).rayon || "",
    cocheLe: null, cochePar: null, creeLe: new Date().toISOString()
  };
  saveItems();
  return id;
}

export function cocher(id, pris, parQui){
  const a = items[id];
  if(!a) return;
  a.cocheLe  = pris ? new Date().toISOString() : null;
  a.cochePar = pris ? (parQui || null) : null;
  saveItems();
}

export function renommer(id, libelle){
  const a = items[id];
  const lib = libelle.trim();
  if(!a || !lib || lib === a.libelle) return;
  a.libelle = lib;
  saveItems();
}

/* Retire l'article de l'affichage et rend de quoi annuler.
   La suppression n'est effective qu'à l'appel de `confirmer`. */
export function supprimerPlusTard(id){
  if(!items[id]) return null;
  enSursis.add(id);
  emettre("rendre");
  return {
    annuler(){ enSursis.delete(id); emettre("rendre"); },
    confirmer(){
      if(!enSursis.has(id)) return;       /* déjà annulé */
      enSursis.delete(id);
      delete items[id];
      saveItems();
    }
  };
}

/* Fin des courses : les articles pris quittent la liste et nourrissent le
   catalogue, qui rendra la prochaine liste beaucoup plus rapide à composer. */
export function terminerLesCourses(liste = LISTE_PAR_DEFAUT){
  const pris = articles(true, liste);
  if(!pris.length) return 0;
  const maintenant = new Date().toISOString();
  pris.forEach(([id, a]) => {
    const f = frequents[a.libelle];
    if(f){ f.utilisations++; f.dernierLe = maintenant; if(a.rayon) f.rayon = a.rayon; }
    else frequents[a.libelle] = {rayon: a.rayon || "", utilisations: 1, dernierLe: maintenant};
    delete items[id];
  });
  saveItems(); saveFrequents();
  return pris.length;
}

export function oublierFrequent(libelle){
  delete frequents[libelle];
  saveFrequents();
}
