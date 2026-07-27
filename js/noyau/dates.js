/* Dates, toujours en heure locale, jamais en UTC.

   C'est délibéré : un poste qui commence à 06h00 doit rester à 06h00 des deux
   côtés du changement d'heure. Passer par UTC le décalerait d'une heure deux
   fois par an.

   Une « clé » est une date au format AAAAMMJJ ("20260727"). Ce format se trie
   comme du texte, ce qui évite de convertir pour comparer deux jours. */

export const pad = n => String(n).padStart(2, "0");

export const dateFrom = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
export const addDays  = (s,i) => { const dt = dateFrom(s); dt.setDate(dt.getDate()+i); return dt; };

export const iso        = dt => dt.getFullYear() + pad(dt.getMonth()+1) + pad(dt.getDate());
export const isoInput   = dt => dt.getFullYear() + "-" + pad(dt.getMonth()+1) + "-" + pad(dt.getDate());
export const dateOfKey  = k => new Date(+k.slice(0,4), +k.slice(4,6)-1, +k.slice(6,8));
export const keyOfInput = s => s.replaceAll("-", "");
export const todayKey   = () => iso(new Date());

export const fmtLong  = dt => dt.toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long"});
export const fmtLongY = dt => dt.toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long", year:"numeric"});
export const fmtShort = dt => dt.toLocaleDateString("fr-FR", {weekday:"short", day:"2-digit", month:"2-digit"});

export const moisLbl = dt => {
  const t = dt.toLocaleDateString("fr-FR", {month:"long", year:"numeric"});
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const hhmmMaintenant = () => new Date().toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});

/* Heure de lever : `mins` minutes avant `hhmm` le jour `dt`. Peut basculer la
   veille au soir — un poste à 00:30 réveille avant minuit. */
export function minusMinutes(dt, hhmm, mins){
  const [h,m] = hhmm.split(":").map(Number);
  const d = new Date(dt);
  d.setHours(h, m - mins, 0, 0);
  return d;
}
