/* Planning → Codes : le tableau des horaires de chaque poste. */

import {$, esc, demanderConfirmation} from "../noyau/ui.js";
import {emettre} from "../noyau/signal.js";
import * as M from "./modele.js";

export function renderCodes(){
  const box = $("codesArea");
  const codesList = Object.keys(M.ref).filter(c => c !== "Vacs");
  const pend = M.pendingCodes();

  const badge = $("reglagesBadge");
  badge.hidden = !pend.length;
  badge.textContent = pend.length || "";

  if(!codesList.length){
    box.innerHTML = '<p class="msg">Aucun code pour l\'instant. Ils apparaîtront au premier import.</p>';
    return;
  }

  /* codes en attente d'horaire en premier, puis ordre alphabétique (sensible à la casse) */
  codesList.sort((a, b) => {
    const pa = pend.includes(a), pb = pend.includes(b);
    if(pa !== pb) return pa ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  let h = '<div class="tscroll"><table><thead><tr><th>Code</th><th>Début</th><th>Fin</th><th></th></tr></thead><tbody>';
  codesList.forEach(c => {
    const k = M.ref[c];
    const off = M.NOALARM(k.type) ? " disabled" : "";
    h += `<tr${pend.includes(c) ? ' class="pend"' : ''}>
      <td class="code"><span class="swatch" data-poste="${esc(k.type)}"></span>${esc(c)}${M.NOALARM(k.type) ? ` <span style="font-weight:500;color:var(--ink-soft)">${M.TYPES[k.type].lbl.toLowerCase()}</span>` : ''}${k.noReveil1 ? ` <span style="font-weight:500;color:var(--ink-soft)">· 1er créneau sans réveil</span>` : ''}</td>
      <td><input type="time" data-c="${esc(c)}" data-f="debut" value="${k.debut}"${off} aria-label="Heure de début du code ${esc(c)}"></td>
      <td><input type="time" data-c="${esc(c)}" data-f="fin" value="${k.fin}"${off} aria-label="Heure de fin du code ${esc(c)}"></td>
      <td><button class="delcode" data-del="${esc(c)}" aria-label="Supprimer le code ${esc(c)}">✕</button></td>
    </tr>`;
    if("debut2" in k){
      h += `<tr>
        <td class="code" style="font-weight:500;color:var(--ink-soft);padding-left:14px">↳ 2ᵉ créneau</td>
        <td><input type="time" data-c="${esc(c)}" data-f="debut2" value="${k.debut2||""}" aria-label="Début du 2e créneau de ${esc(c)}"></td>
        <td><input type="time" data-c="${esc(c)}" data-f="fin2" value="${k.fin2||""}" aria-label="Fin du 2e créneau de ${esc(c)}"></td>
        <td></td></tr>`;
    }
  });
  box.innerHTML = h + "</tbody></table></div>";

  if(pend.length){
    const p = document.createElement("p");
    p.className = "msg warn";
    p.textContent = `Il manque l'heure de début pour : ${pend.join(", ")}. Ces jours n'auront pas de réveil.`;
    box.appendChild(p);
  }

  box.querySelectorAll("[data-c]").forEach(el => {
    el.addEventListener("change", e => {
      const t = e.target;
      M.ref[t.dataset.c][t.dataset.f] = t.value;
      M.saveRef();
      emettre("rendre");
    });
  });
  box.querySelectorAll("[data-del]").forEach(el => {
    el.addEventListener("click", async () => {
      const c = el.dataset.del;
      const used = Object.values(M.jours).filter(x => x === c).length;
      const extra = used ? `Il est utilisé sur ${used} jour${used>1?"s":""} planifié${used>1?"s":""} : ces jours n'auront plus de réveil.` : "";
      if(!await demanderConfirmation(`Supprimer le code ${c} ?`, extra, {valider:"Supprimer", danger:true})) return;
      delete M.ref[c];
      M.saveRef();
      emettre("rendre");
    });
  });
}
