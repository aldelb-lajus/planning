/* Onglet Importer : coller une ligne de codes, la relire, l'ajouter au planning. */

import {$, esc} from "../noyau/ui.js";
import {emettre} from "../noyau/signal.js";
import {dateFrom, addDays, iso, isoInput, dateOfKey, fmtLong, fmtLongY} from "../noyau/dates.js";
import * as M from "./modele.js";
import {suivreFinPlanning} from "./export.js";

let pasteCells = [];   // codes découpés du collage en cours

/* Cellule d'en-tête : contient un espace ou dépasse 4 caractères (nom, mention de
   validation…). Les codes de poste font au plus 3-4 caractères, sans espace. */
const isHeaderCell = c => c.includes(" ") || c.length > 4;

export function parseLine(raw){
  if(!raw.trim()) return {head:[], codes:[]};
  let parts = raw.includes("\t")
    ? raw.replace(/\r?\n/g,"\t").split("\t").map(s => s.trim())
    : raw.trim().split(/\s+/);
  while(parts.length && parts[parts.length-1] === "") parts.pop();
  /* L'en-tête peut contenir des cellules courtes (n° d'équipe, validation) :
     on coupe après la dernière cellule d'allure « en-tête » trouvée en début de ligne. */
  let cut = 0;
  for(let i = 0; i < Math.min(parts.length, 8); i++)
    if(parts[i] !== "" && isHeaderCell(parts[i])) cut = i+1;
  return {head: parts.slice(0, cut), codes: parts.slice(cut)};
}

export function renderImporter(){
  const raw = $("line").value;
  const {head, codes} = parseLine(raw);
  pasteCells = codes;
  const box = $("parseInfo");
  const startV = $("start").value;

  if(!raw.trim()){ box.innerHTML = ""; $("saveCycle").disabled = true; return; }

  let h = "";
  if(head.length)
    h += `<p class="msg">En-tête détecté et ignoré&nbsp;: ${head.map(esc).join(" · ")}</p>`;

  if(!codes.length){
    h += `<p class="msg warn">Aucun code détecté dans ce collage.</p>`;
  }else if(startV){
    const d0 = dateFrom(startV), d1 = addDays(startV, codes.length-1);
    h += `<p class="msg"><strong>${codes.length} jours</strong> depuis le ${fmtLong(d0)}
      → fin le <strong>${fmtLongY(d1)}</strong> (= début + ${codes.length-1} jours).</p>`;
    if(codes.length % 7 === 0)
      h += `<p class="msg ok">Soit ${codes.length/7} semaine${codes.length>7?"s":""} complète${codes.length>7?"s":""}.</p>`;
    else
      h += `<p class="msg warn">${codes.length} n'est pas un multiple de 7 — c'est presque toujours
        une erreur de collage. Vérifie qu'il ne manque pas de cellules.</p>`;

    let rewrite = 0;
    for(let i = 0; i < codes.length; i++) if(iso(addDays(startV, i)) in M.jours) rewrite++;
    if(rewrite)
      h += `<p class="msg warn">${rewrite} jour${rewrite>1?"s":""} déjà planifié${rewrite>1?"s":""}
        ser${rewrite>1?"ont":"a"} réécrit${rewrite>1?"s":""} par cet import.</p>`;
  }else{
    h += `<p class="msg warn">Choisis le premier jour du cycle pour voir les dates.</p>`;
  }

  const vides = codes.filter(c => c === "").length;
  if(vides)
    h += `<p class="msg warn">${vides} cellule${vides>1?"s":""} vide${vides>1?"s":""} au milieu de la ligne&nbsp;:
      ces jours n'auront pas de réveil.</p>`;

  const unk = [...new Set(codes.map(c => c ? M.canon(c) : ""))].filter(c => c && !M.ref[c]);
  if(unk.length)
    h += `<p class="msg warn">Nouveau${unk.length>1?"x":""} code${unk.length>1?"s":""}&nbsp;:
      ${unk.map(esc).join(", ")}. Ils seront ajoutés dans l&rsquo;onglet Codes, à compléter avec leurs horaires.</p>`;

  box.innerHTML = h;
  $("saveCycle").disabled = !(codes.length && startV);
}

function saveCycle(){
  const startV = $("start").value;
  if(!startV || !pasteCells.length) return;

  const cells = pasteCells.map(c => c ? M.canon(c) : "");
  const unk = [...new Set(cells)].filter(c => c && !M.ref[c]);
  unk.forEach(c => M.ref[c] = M.newCode(c));

  cells.forEach((c, i) => { M.jours[iso(addDays(startV, i))] = c; });
  M.saveRef(); M.saveJours();

  $("line").value = "";
  const p = M.pendingCodes();
  suivreFinPlanning();
  emettre("rendre");
  $("saveMsg").innerHTML = `<p class="msg ok">Planning mis à jour — voir l'onglet Planning.</p>`
    + (p.length ? `<p class="msg warn">${p.length} code${p.length>1?"s":""} sans horaire
       (${p.map(esc).join(", ")})&nbsp;: à compléter dans l&rsquo;onglet Codes, sinon ces jours ne sonneront pas.</p>` : "");
}

export function brancherImporter(){
  $("line").addEventListener("input", () => { $("saveMsg").innerHTML = ""; renderImporter(); });
  $("start").addEventListener("change", renderImporter);
  $("saveCycle").addEventListener("click", saveCycle);
}

/* date de début proposée : lendemain du dernier jour planifié, sinon aujourd'hui */
export function initDateDebut(){
  const keys = M.planKeys();
  if(keys.length){
    const last = dateOfKey(keys[keys.length-1]);
    last.setDate(last.getDate()+1);
    $("start").value = isoInput(last);
  }else{
    $("start").value = isoInput(new Date());
  }
}
