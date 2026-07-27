/* Petit bus de messages.

   Il existe pour une seule raison : un module qui modifie des données doit
   pouvoir prévenir « quelque chose a changé » sans connaître qui écoute. Sans
   lui, le modèle importerait le moteur de synchro, qui importerait le modèle —
   et les deux se référenceraient en rond.

   Deux messages en circulation :
     « modifie » — des données ont changé et méritent d'être envoyées
     « rendre »  — l'affichage doit être refait */

const abonnes = {};

export const sur = (nom, fn) => (abonnes[nom] = abonnes[nom] || []).push(fn);
export const emettre = (nom, ...args) => (abonnes[nom] || []).forEach(fn => fn(...args));
