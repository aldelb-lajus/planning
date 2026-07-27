/* Affichage du planning : bandeau du prochain réveil, grille, liste, et
   l'éditeur qui s'ouvre au clic sur un jour. */

import {$, esc} from "../noyau/ui.js";
import {emettre} from "../noyau/signal.js";
import {pad, iso, isoInput, dateOfKey, todayKey, fmtLong, fmtLongY, fmtShort,
        moisLbl, minusMinutes} from "../noyau/dates.js";
import * as M from "./modele.js";
import {suivreFinPlanning} from "./export.js";

let planMode = "grid";   // vue du planning : "grid" | "list"

/* ================= prochain réveil (bandeau global) ================= */
export function renderNext(){
  const box = $("next");
  const keys = M.planKeys();
  if(!keys.length){ box.innerHTML = ""; return; }

  const tk = todayKey(), now = new Date();
  /* le réveil le plus proche dans le futur, tous jours et tous créneaux confondus
     (un créneau à 00:00 réveille la veille au soir) */
  let best = null;
  for(const key of keys){
    const code = M.jours[key];
    const k = M.ref[code];
    if(!k || M.NOALARM(k.type)) continue;
    const dt = dateOfKey(key);
    for(const s of M.segsOf(k)){
      if(!s.alarm) continue;                     /* créneau sans réveil (1er créneau de N) */
      const w = minusMinutes(dt, s.debut, M.prefs.lead);
      if(w > now && (!best || w < best.w)) best = {w, code, debut:s.debut};
    }
  }
  if(best){
    box.innerHTML = `<div class="next"><div class="lbl">Prochain réveil</div>
      <div class="hour">${pad(best.w.getHours())}:${pad(best.w.getMinutes())}</div>
      <div class="det">${fmtLong(best.w)} · poste ${esc(best.code)} à ${best.debut}</div></div>`;
    return;
  }
  /* pas de réveil à venir : montrer le prochain jour de repos/vacances, sinon rien */
  const nk = keys.find(k => k >= tk);
  if(nk && M.ref[M.jours[nk]] && M.NOALARM(M.ref[M.jours[nk]].type)){
    box.innerHTML = `<div class="next rest"><div class="lbl">Prochain jour</div>
      <div class="hour">${M.TYPES[M.ref[M.jours[nk]].type].lbl}</div>
      <div class="det">${fmtLong(dateOfKey(nk))} · pas de réveil</div></div>`;
    return;
  }
  box.innerHTML = `<div class="next rest"><div class="lbl">Prochain réveil</div>
    <div class="hour">Rien à venir</div>
    <div class="det">Le planning est terminé — importe la suite.</div></div>`;
}

/* ================= rendu grille / liste sur une plage ================= */
export function gridHtml(k0, k1){
  const tk = todayKey();
  /* caler la grille sur la semaine : lundi avant k0, dimanche après k1 */
  const d0 = dateOfKey(k0); d0.setDate(d0.getDate() - (d0.getDay()+6)%7);
  const d1 = dateOfKey(k1); d1.setDate(d1.getDate() + (7-d1.getDay())%7);
  let h = '<div class="grid">' + M.DOW.map(d => `<div class="dow">${d}</div>`).join("");
  for(let ws = new Date(d0); ws <= d1; ws.setDate(ws.getDate()+7)){
    /* libellé de mois avant la première semaine et avant chaque semaine contenant un 1er */
    let lab = ws.getTime() === d0.getTime() ? dateOfKey(k0) : null;
    for(let i=0;i<7;i++){ const d = new Date(ws); d.setDate(d.getDate()+i); if(d.getDate()===1) lab = d; }
    if(lab) h += `<div class="mois">${moisLbl(lab)}</div>`;
    for(let i=0;i<7;i++){
      const dt = new Date(ws); dt.setDate(dt.getDate()+i);
      const key = iso(dt);
      const st = M.statusOf(key);
      const dnum = `<span class="dnum">${dt.getDate()}</span>`;
      if(st === "off" || st === "vide"){
        h += `<div class="cell aremplir" data-key="${key}" title="${dt.toLocaleDateString("fr-FR")} — à remplir, appuie pour choisir le poste">${dnum}</div>`;
        continue;
      }
      const c = M.jours[key];
      const k = M.ref[c];
      const type = st === "inconnu" ? null : k.type;
      let cls = "cell" + (key<tk ? " past" : "") + (key===tk ? " today" : "");
      if(st === "inconnu") cls += " vide";
      const bg = type ? `background:${M.TYPES[type].c}` : "";
      const hr = (st === "ok") ? M.segsOf(k).map(s => `<small>${s.debut}${s.fin&&s.fin!==s.debut?"–"+s.fin:""}</small>`).join("") : "";
      const mark = (st === "sansheure" || st === "inconnu") ? '<span class="mark" title="Pas d\'horaire">!</span>' : "";
      const titles = {inconnu:"code inconnu", sansheure:"horaire manquant"};
      const title = dt.toLocaleDateString("fr-FR") + (titles[st] ? " — "+titles[st] : "") + " — appuie pour modifier";
      h += `<div class="${cls}" data-key="${key}" style="${bg}" title="${title}">${dnum}${esc(c)||"·"}${hr}${mark}</div>`;
    }
  }
  return h + "</div>";
}

export function listHtml(k0, k1){
  const tk = todayKey();
  let h = '<div class="dlist">';
  const d1 = dateOfKey(k1);
  let curMois = "";
  for(let dt = dateOfKey(k0); dt <= d1; dt.setDate(dt.getDate()+1)){
    const m = moisLbl(dt);
    if(m !== curMois){ curMois = m; h += `<div class="lmois">${m}</div>`; }
    const key = iso(dt);
    const st = M.statusOf(key);
    const c = M.jours[key];
    const k = c ? M.ref[c] : null;
    let cls = "drow" + (key<tk ? " past" : "") + (key===tk ? " today" : "");
    const chipBg = (st==="off" || st==="vide" || st==="inconnu") ? "var(--rule);color:var(--ink-soft)" : M.TYPES[k.type].c;
    let det = "", lever = "";
    if(st === "off" || st === "vide") det = `<span style="color:var(--ink-soft)">à remplir — appuie pour choisir le poste</span>`;
    else if(st === "inconnu")    det = `<span class="warn-t">code inconnu — pas de réveil</span>`;
    else if(st === "repos" || st === "vacances") det = M.TYPES[k.type].lbl;
    else if(st === "sansheure")  det = `<span class="warn-t">horaire manquant — ne sonnera pas</span>`;
    else{
      const segs = M.segsOf(k);
      det = `${M.TYPES[k.type].lbl} · ${segs.map(s => `${s.debut}–${s.fin}${s.alarm?"":" (sans réveil)"}`).join(" · ")}`;
      const levers = segs.filter(s => s.alarm).map(s => {
        const w = minusMinutes(dt, s.debut, M.prefs.lead);
        return `${iso(w)!==key ? "<small>veille</small> " : ""}${pad(w.getHours())}:${pad(w.getMinutes())}`;
      });
      lever = levers.length ? `<span class="lever">${levers.join(" · ")}</span>` : "";
    }
    h += `<div class="${cls}" data-key="${key}"><span class="ld">${fmtShort(dt)}</span>
      <span class="chip" style="background:${chipBg}">${esc(c||"")||"·"}</span>
      <span class="det">${det}</span>${lever}</div>`;
  }
  return h + "</div>";
}

/* ================= onglet Planning ================= */
export function renderPlanning(){
  const keys = M.planKeys();
  const info = $("planInfo"), notes = $("planNotes"), view = $("planView");
  if(!keys.length){
    info.textContent = "";
    notes.innerHTML = "";
    view.innerHTML = `<p class="msg">Aucun planning pour l'instant — passe par l'onglet Importer.</p>`;
    $("delWeek").disabled = true;
    return;
  }
  const k0 = keys[0], k1 = keys[keys.length-1];
  /* les semaines passées sont masquées : l'affichage démarre au lundi de la
     semaine en cours (les données restent là, l'onglet Exporter y accède) */
  const lundi = new Date(); lundi.setDate(lundi.getDate() - (lundi.getDay()+6)%7);
  const kMon = iso(lundi);
  const kStart = (k0 < kMon && k1 >= kMon) ? kMon : k0;
  const visibles = keys.filter(k => k >= kStart);
  const masques = keys.length - visibles.length;

  info.innerHTML = `Du <strong>${fmtLong(dateOfKey(kStart))}</strong> au <strong>${fmtLongY(dateOfKey(k1))}</strong>
    · ${visibles.length} jours`
    + (masques ? ` <span style="color:var(--ink-soft)">· ${masques} jour${masques>1?"s":""} passé${masques>1?"s":""} masqué${masques>1?"s":""}</span>` : "");

  const miss = visibles.filter(k => ["inconnu","sansheure"].includes(M.statusOf(k))).length;
  /* « à remplir » couvre toute la période affichée, trous d'import compris : à
     l'écran ils ne se distinguent pas d'un jour vide, le compte doit suivre. */
  let vides = 0;
  for(let d = dateOfKey(kStart), fin = dateOfKey(k1); d <= fin; d.setDate(d.getDate()+1)){
    const st = M.statusOf(iso(d));
    if(st === "vide" || st === "off") vides++;
  }
  const retirables = M.videsEnFin().length;
  $("delWeek").disabled = !retirables;
  $("delWeek").title = retirables
    ? `Retire les ${retirables} dernier${retirables>1?"s":""} jour${retirables>1?"s":""} à remplir`
    : "Rien à retirer : le planning ne se termine pas par des jours à remplir";
  notes.innerHTML =
    (miss ? `<p class="msg warn">${miss} jour${miss>1?"s":""} sans horaire —
      complète-les dans l&rsquo;onglet Codes, sinon pas de réveil ces jours-là.</p>` : "")
    + (vides ? `<p class="msg">${vides} jour${vides>1?"s":""} à remplir —
      appuie dessus pour choisir le poste.</p>` : "");

  $("viewGrid").setAttribute("aria-pressed", planMode === "grid");
  $("viewList").setAttribute("aria-pressed", planMode === "list");
  view.innerHTML = planMode === "list" ? listHtml(kStart, k1) : gridHtml(kStart, k1);
  $("gridHint").style.display = planMode === "list" ? "none" : "";

  view.querySelectorAll("[data-key]").forEach(el =>
    el.addEventListener("click", () => openDayEditor(el.dataset.key)));
}

/* ---------- éditeur d'un jour (clic sur une case) ---------- */
export function openDayEditor(key){
  const dt = dateOfKey(key);
  /* liste de tous les codes possibles : la palette standard + ceux déjà utilisés,
     dédupliqués, sans le code réservé « Vacs » (bouton dédié) */
  const codesList = [...new Set([...M.KNOWN_CODES, ...Object.keys(M.ref)])].filter(c => c !== "Vacs");

  const ov = document.createElement("div");
  ov.className = "sheet-ov";
  const choix = c => {
    const type = M.ref[c] ? M.ref[c].type : M.guessType(c);
    const k = M.ref[c];
    const info = M.NOALARM(type) ? M.TYPES[type].lbl
      : (k && k.debut ? k.debut + (k.fin?"–"+k.fin:"") : "horaire à régler");
    return `<button class="daychoice" data-set="${esc(c)}">
      <span class="chip" style="background:${M.TYPES[type].c}">${esc(c)}</span>
      <span>${info}</span></button>`;
  };
  ov.innerHTML = `<div class="sheet" role="dialog" aria-label="Modifier le jour">
    <p class="sheet-h">${fmtLong(dt).replace(/^./, x => x.toUpperCase())}</p>
    <div class="daygrid">
      ${codesList.map(choix).join("")}
      <button class="daychoice" data-set="Vacs"><span class="chip" style="background:var(--vacances)">V</span><span>Vacs</span></button>
      <button class="daychoice" data-set=""><span class="chip" style="background:transparent;border:1.5px dashed var(--ink-soft);color:var(--ink-soft)">·</span><span>À remplir</span></button>
    </div>
    <div class="btns" style="justify-content:flex-end;margin-top:14px">
      <button class="ghost" data-annuler="1">Annuler</button>
      <button data-valider="1">Valider</button>
    </div>
  </div>`;
  document.body.appendChild(ov);

  /* état d'origine et sélection en attente : rien n'est écrit avant Valider.
     Un jour absent du planning vaut « à remplir » : c'est le même état à l'écran,
     valider le matérialise sans que l'utilisateur ait à s'en soucier. */
  const origine = (key in M.jours) ? M.jours[key] : "";
  let pending = origine;

  const close = () => ov.remove();
  const refreshSel = () => ov.querySelectorAll("[data-set]").forEach(b =>
    b.classList.toggle("sel", b.dataset.set === (pending ?? " ")));

  refreshSel();
  ov.querySelectorAll("[data-set]").forEach(b =>
    b.addEventListener("click", () => { pending = b.dataset.set; refreshSel(); }));

  ov.querySelector("[data-annuler]").addEventListener("click", close);
  ov.addEventListener("click", e => { if(e.target === ov) close(); });   /* tap hors de la feuille = annuler */

  ov.querySelector("[data-valider]").addEventListener("click", () => {
    if(pending !== origine){
      const c = pending;
      if(c === "Vacs" && !M.ref["Vacs"]){ M.ref["Vacs"] = {libelle:"", type:"vacances", debut:"", fin:""}; M.saveRef(); }
      else if(c && !M.ref[c]){ M.ref[c] = M.newCode(c); M.saveRef(); }
      M.jours[key] = c;
      M.saveJours();
      suivreFinPlanning();
      emettre("rendre");
    }
    close();
  });
}

export function brancherPlanning(){
  $("viewGrid").addEventListener("click", () => { planMode = "grid"; renderPlanning(); });
  $("viewList").addEventListener("click", () => { planMode = "list"; renderPlanning(); });

  $("clearPlan").addEventListener("click", () => {
    if(!Object.keys(M.jours).length) return;
    if(!confirm("Effacer tout le planning ?\nLes codes et leurs horaires sont conservés. Les événements déjà envoyés au calendrier ne seront pas retirés.")) return;
    M.viderJours(); M.saveJours(); emettre("rendre");
  });

  /* Ajouter une semaine : 7 jours à remplir après le dernier jour planifié (ou à
     partir du lundi de cette semaine si le planning est vide). */
  $("addWeek").addEventListener("click", () => {
    const keys = M.planKeys();
    let start;
    if(keys.length){
      start = dateOfKey(keys[keys.length-1]); start.setDate(start.getDate()+1);
    }else{
      start = new Date(); start.setDate(start.getDate() - (start.getDay()+6)%7);
    }
    for(let i=0;i<7;i++){
      const k = iso(new Date(start.getFullYear(), start.getMonth(), start.getDate()+i));
      if(!(k in M.jours)) M.jours[k] = "";
    }
    M.saveJours();
    suivreFinPlanning();
    emettre("rendre");
  });

  /* Symétrique du bouton précédent — voir videsEnFin() : ne retire que des jours
     encore à remplir, jamais un jour où un poste est saisi. */
  $("delWeek").addEventListener("click", () => {
    const aRetirer = M.videsEnFin();
    if(!aRetirer.length) return;
    aRetirer.forEach(k => delete M.jours[k]);
    M.saveJours();
    suivreFinPlanning();
    emettre("rendre");
  });
}
