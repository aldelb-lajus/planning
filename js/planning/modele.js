/* Les données du planning et les règles qui les gouvernent.

   Trois objets, tous exportés en lecture directe :
     ref    code de poste -> {libelle, type, debut, fin, debut2?, fin2?, noReveil1?}
     jours  clé AAAAMMJJ  -> code (chaîne vide = jour à remplir)
     prefs  {lead, calName}

   Aucun affichage ici, aucune requête réseau : ce fichier ne décrit que ce
   qu'est un planning. */

import {store, emballer} from "../noyau/store.js";
import {emettre} from "../noyau/signal.js";
import {iso} from "../noyau/dates.js";

export let ref = {};
export let jours = {};
export let prefs = {lead:45, calName:"Travail"};

export const TYPES = {
  matin:   {lbl:"Matin",      c:"var(--matin)"},
  aprem:   {lbl:"Après-midi", c:"var(--aprem)"},
  nuit:    {lbl:"Nuit",       c:"var(--nuit)"},
  jour:    {lbl:"Journée",    c:"var(--jour)"},
  repos:   {lbl:"Repos",      c:"var(--repos)"},
  vacances:{lbl:"Vacs",       c:"var(--vacances)"},
  autre:   {lbl:"Autre",      c:"var(--autre)"}
};

/* jours sans réveil : repos et vacances (informatifs, jamais d'alarme) */
export const NOALARM = t => t === "repos" || t === "vacances";
export const DOW = ["L","M","Me","J","V","S","D"];

/* palette de codes proposée dans l'éditeur d'un jour. La casse n'est pas
   significative (A = a, M = m…) : ces orthographes sont les formes canoniques. */
export const KNOWN_CODES = ["M","A","N","Ne","Nf","Nwe","J","B","Bp","Bp1","R","Rh"];

/* horaires par défaut à la création d'un code. « N » est un double poste :
   deux créneaux dans la même journée. Le 1er (00:00–06:30) est la fin d'une nuit
   déjà en cours — pas de réveil (déjà sonné la veille) ; seul le 2e (19:30) sonne. */
export const CODE_DEFAULTS = {
  "N":  {type:"nuit", debut:"00:00", fin:"06:30", debut2:"19:30", fin2:"00:00", noReveil1:true},
  "Nf": {type:"nuit", debut:"00:00", fin:"06:30", noReveil1:true}
};

/* ---------- enregistrement ----------
   Écrit le cache local puis signale le changement ; c'est l'application qui
   décide d'en faire une synchronisation. */
export const saveRef   = () => { store.set("cycle:codes", emballer(ref));   emettre("modifie"); };
export const saveJours = () => { store.set("cycle:jours", emballer(jours)); emettre("modifie"); };
export const savePrefs = () => { store.set("cycle:prefs", emballer(prefs)); emettre("modifie"); };

/* Écriture silencieuse : sert quand les données viennent d'être lues en base,
   ou lors d'une remise en conformité — inutile de les renvoyer d'où elles sortent. */
export function ecrireCache(){
  store.set("cycle:codes", emballer(ref));
  store.set("cycle:jours", emballer(jours));
  store.set("cycle:prefs", emballer(prefs));
}

export const remplacerRef   = o => { ref = o || {}; };
export const remplacerJours = o => { jours = o || {}; };
export const remplacerPrefs = o => { prefs = Object.assign({lead:45, calName:"Travail"}, o || {}); };
export const viderJours     = () => { jours = {}; };

/* ---------- codes ---------- */
export function guessType(code){
  const c = code.toLowerCase();
  if(c.startsWith("r")) return "repos";
  if(c.startsWith("m")) return "matin";
  if(c.startsWith("a")) return "aprem";
  if(c.startsWith("n")) return "nuit";
  if(c.startsWith("j")) return "jour";
  return "autre";
}

/* Forme canonique d'un code, insensible à la casse : « a » → « A », « nWE » → « Nwe ».
   La palette standard prime, puis les codes déjà connus. */
export function canon(code){
  if(!code) return code;
  const low = code.toLowerCase();
  for(const k of KNOWN_CODES) if(k.toLowerCase() === low) return k;
  for(const k of Object.keys(ref)) if(k.toLowerCase() === low) return k;
  return code;
}

/* Crée l'entrée d'un code, avec ses horaires par défaut s'ils sont connus. */
export function newCode(c){
  const d = CODE_DEFAULTS[c];
  return d ? Object.assign({libelle:"", debut:"", fin:""}, d)
           : {libelle:"", type:guessType(c), debut:"", fin:""};
}

/* Créneaux de travail d'un code (1, ou 2 pour un double poste comme N).
   `alarm` = ce créneau déclenche un réveil (le 1er créneau de N n'en déclenche pas). */
export function segsOf(k){
  const s = [];
  if(k.debut)  s.push({debut:k.debut,  fin:k.fin  || k.debut,  alarm: !k.noReveil1});
  if(k.debut2) s.push({debut:k.debut2, fin:k.fin2 || k.debut2, alarm: !k.noReveil2});
  return s;
}

/* Mise en conformité des données (casse fusionnée, N en double poste, Vacances→Vacs).
   Modifie ref/jours en place ; l'enregistrement est laissé à l'appelant. */
export function migrate(){
  let ch = false;
  if(ref["Vacances"]){
    if(!ref["Vacs"]) ref["Vacs"] = ref["Vacances"];
    ref["Vacs"].type = "vacances";
    delete ref["Vacances"];
    ch = true;
  }
  const remap = {};
  Object.keys(ref).forEach(c => {
    const cc = canon(c);
    if(cc !== c){ if(!ref[cc]) ref[cc] = ref[c]; delete ref[c]; remap[c] = cc; ch = true; }
  });
  Object.keys(jours).forEach(k => {
    const v = jours[k];
    if(v === "Vacances"){ jours[k] = "Vacs"; ch = true; return; }
    if(!v) return;
    const cv = remap[v] || canon(v);
    if(cv !== v){ jours[k] = cv; ch = true; }
  });
  if(ref["N"] && !("debut2" in ref["N"])){ Object.assign(ref["N"], CODE_DEFAULTS["N"]); ch = true; }
  /* 1er créneau de N sans réveil (données antérieures à cette règle) */
  if(ref["N"] && ref["N"].debut2 && !("noReveil1" in ref["N"])){ ref["N"].noReveil1 = true; ch = true; }
  /* Nf (nuit fin) : suite de la nuit de la veille, pas de réveil */
  if(ref["Nf"] && !("noReveil1" in ref["Nf"])){ ref["Nf"].noReveil1 = true; ch = true; }
  return ch;
}

/* ---------- le planning ---------- */
export const planKeys = () => Object.keys(jours).sort();

/* Ménage : les jours plus vieux de 90 jours sortent du planning. Appliqué de la
   même façon sur toutes les données, locales comme reçues. */
export const pruneCutoff = () => { const d = new Date(); d.setDate(d.getDate()-90); return iso(d); };
export function pruneJours(o){
  const cutoff = pruneCutoff();
  let ch = false;
  Object.keys(o || {}).forEach(k => { if(k < cutoff){ delete o[k]; ch = true; } });
  return ch;
}

export const pendingCodes = () =>
  Object.keys(ref).filter(c => !NOALARM(ref[c].type) && !ref[c].debut);

/* Statut d'un jour : "off" (absent du planning), "vide" (présent, sans poste),
   "inconnu", "repos", "vacances", "sansheure", "ok".
   « off » et « vide » ne se distinguent pas à l'écran — ils désignent tous deux
   un jour à remplir ; seule la base sait que l'un a une ligne et l'autre non. */
export function statusOf(key){
  if(!(key in jours)) return "off";
  const c = jours[key];
  if(c === "") return "vide";
  const k = ref[c];
  if(!k) return "inconnu";
  if(k.type === "repos") return "repos";
  if(k.type === "vacances") return "vacances";
  if(!k.debut) return "sansheure";
  return "ok";
}

/* Jours à remplir en toute fin de planning, au plus une semaine.
   Un jour où un poste est saisi arrête le décompte : le bouton « retirer une
   semaine » ne peut donc jamais effacer du planning réellement rempli. */
export function videsEnFin(){
  const k = planKeys();
  let n = 0;
  while(n < 7 && k.length - n > 0 && jours[k[k.length-1-n]] === "") n++;
  return k.slice(k.length - n);
}
