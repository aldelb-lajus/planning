/* Onglet Exporter : .ics, Google Agenda, PDF.

   La sauvegarde .json a vécu ici. Elle datait du temps où les données ne
   vivaient que dans le navigateur ; depuis Supabase, la base est la source de
   vérité et personne n'a jamais rouvert un de ces fichiers. Retirée le
   29/07/2026 avec l'import qui allait avec. */

import {$, esc, download} from "../noyau/ui.js";
import {pad, iso, isoInput, dateOfKey, todayKey, keyOfInput,
        fmtLong, fmtLongY} from "../noyau/dates.js";
import * as M from "./modele.js";

/* Importé par vue.js et importer.js : la fin de la plage d'export suit le
   dernier jour planifié, sans quoi un ajout de semaine sortirait de la plage. */
export function suivreFinPlanning(){
  const keys = M.planKeys();
  if(keys.length) $("expEnd").value = isoInput(dateOfKey(keys[keys.length-1]));
}

function exportRange(){
  const a = $("expStart").value, b = $("expEnd").value;
  if(!a || !b) return null;
  const k0 = keyOfInput(a), k1 = keyOfInput(b);
  return k0 <= k1 ? {k0, k1} : null;
}

export function renderExport(){
  const keys = M.planKeys();
  const r = exportRange();
  if(!keys.length){ $("expInfo").textContent = "Aucun planning à exporter pour l'instant."; return; }
  if(!r){ $("expInfo").textContent = "Choisis une plage de dates valide (début avant fin)."; return; }
  const n = keys.filter(k => k >= r.k0 && k <= r.k1).length;
  $("expInfo").textContent = n
    ? n + " jour" + (n>1?"s":"") + " planifié" + (n>1?"s":"") + " dans cette plage."
    : "Aucun jour planifié dans cette plage.";
}

/* valeurs par défaut : aujourd'hui → dernier jour planifié */
export function setExportDefaults(){
  const keys = M.planKeys();
  if(!keys.length) return;
  const tk = todayKey();
  const first = keys.find(k => k >= tk) || keys[0];
  if(!$("expStart").value) $("expStart").value = isoInput(dateOfKey(first));
  if(!$("expEnd").value || keyOfInput($("expEnd").value) < keyOfInput($("expStart").value))
    $("expEnd").value = isoInput(dateOfKey(keys[keys.length-1]));
}

/* ---------- export .ics ----------
   Heures locales flottantes : pas de suffixe Z, pas de conversion UTC, pour que
   06h00 reste 06h00 des deux côtés du changement d'heure. */
const escIcs = s => String(s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
const icsHead = () => ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//F&A//FR",
  "CALSCALE:GREGORIAN","X-WR-CALNAME:" + escIcs(M.prefs.calName || "Travail")];
function icsStamp(){
  const n = new Date();
  return n.getUTCFullYear()+pad(n.getUTCMonth()+1)+pad(n.getUTCDate())
    +"T"+pad(n.getUTCHours())+pad(n.getUTCMinutes())+pad(n.getUTCSeconds())+"Z";
}

export function buildIcs(k0, k1){
  const out = icsHead();
  const stamp = icsStamp();
  const s = {ok:0, evts:0, repos:0, miss:0};
  M.planKeys().forEach(key => {
    if(key < k0 || key > k1) return;
    const st = M.statusOf(key);
    if(st === "repos" || st === "vacances"){ s.repos++; return; }
    if(st === "vide"){ return; }                    /* jour à remplir : ni exporté ni « ignoré » */
    if(st !== "ok"){ s.miss++; return; }
    const c = M.jours[key];
    const k = M.ref[c];
    const dt = dateOfKey(key);
    M.segsOf(k).forEach((seg, si) => {
      const fin = seg.fin || seg.debut;
      const [dh,dm] = seg.debut.split(":");
      const [fh,fm] = fin.split(":");
      const end = new Date(dt);
      if(fin <= seg.debut) end.setDate(end.getDate()+1);   /* fin le lendemain (nuit / minuit) */
      const ev = ["BEGIN:VEVENT",
        "UID:" + key + (si?"-"+si:"") + "@fa-planning",
        "DTSTAMP:" + stamp,
        "DTSTART:" + key + "T" + dh + dm + "00",
        "DTEND:"   + iso(end) + "T" + fh + fm + "00",
        "SUMMARY:" + escIcs(c)];
      if(seg.alarm){                                       /* réveil seulement sur les créneaux qui sonnent */
        ev.push("BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:Debout",
          "TRIGGER:-PT" + (M.prefs.lead||0) + "M","END:VALARM");
        s.ok++;
      }
      ev.push("END:VEVENT");
      out.push(...ev);
      s.evts++;
    });
  });
  out.push("END:VCALENDAR");
  return {txt: out.join("\r\n"), s};
}

function doExport(versGoogle){
  const r = exportRange();
  if(!r){ $("exportMsg").innerHTML = `<p class="msg warn">Choisis une plage de dates valide.</p>`; return; }
  const {txt, s} = buildIcs(r.k0, r.k1);
  if(!s.evts){
    $("exportMsg").innerHTML = `<p class="msg warn">Aucun poste exploitable dans cette plage — vérifie les dates, et les horaires dans l&rsquo;onglet Codes.</p>`;
    return;
  }
  const parts = [`<strong>${s.evts} poste${s.evts>1?"s":""} exporté${s.evts>1?"s":""}</strong> · ${s.ok} réveil${s.ok>1?"s":""}`];
  if(s.repos) parts.push(`${s.repos} jour${s.repos>1?"s":""} sans réveil (repos, vacances)`);
  if(s.miss)  parts.push(`<strong>${s.miss} jour${s.miss>1?"s":""} ignoré${s.miss>1?"s":""} faute d'horaire</strong>`);
  let em = `<p class="msg ${s.miss ? "warn" : "ok"}">${parts.join(" · ")}.</p>`;

  const cal = esc(M.prefs.calName || "Travail");
  if(versGoogle){
    em += `<p class="msg">Pour Google Agenda, avec le fichier téléchargé&nbsp;:<br>
      1. Sur <a href="https://calendar.google.com" target="_blank" rel="noopener">calendar.google.com</a>,
      crée une fois le calendrier «&nbsp;${cal}&nbsp;» (Autres agendas → +).<br>
      2. Ouvre <a href="https://calendar.google.com/calendar/u/0/r/settings/export" target="_blank" rel="noopener">Paramètres
      → Importer et exporter</a>.<br>
      3. Choisis le fichier et le calendrier «&nbsp;${cal}&nbsp;», puis Importer.</p>`;
  }else{
    em += `<p class="msg">À l'ouverture du fichier sur iPhone, ajoute les événements au calendrier
      «&nbsp;${cal}&nbsp;».</p>`;
  }
  $("exportMsg").innerHTML = em;
  download(txt, "planning-" + $("expStart").value + "_" + $("expEnd").value + ".ics");
}

/* ---------- export PDF : vue imprimable + boîte d'impression ---------- */
async function doPdf(mode){
  const r = exportRange();
  if(!r){ $("exportMsg").innerHTML = `<p class="msg warn">Choisis une plage de dates valide.</p>`; return; }
  /* import tardif : sans lui, vue.js et export.js s'importeraient mutuellement */
  const {gridHtml, listHtml} = await import("./vue.js");
  $("printArea").innerHTML =
    `<h1>Planning de Fab</h1>
     <p class="psub">Du ${fmtLong(dateOfKey(r.k0))} au ${fmtLongY(dateOfKey(r.k1))} · lever ${M.prefs.lead} min avant la prise de poste</p>`
    + (mode === "list" ? listHtml(r.k0, r.k1) : gridHtml(r.k0, r.k1));
  const old = document.title;
  document.title = "planning-" + $("expStart").value + "_" + $("expEnd").value;
  window.print();
  document.title = old;
}

export function brancherExport(){
  $("expIcs").addEventListener("click", () => doExport(false));
  $("expGcal").addEventListener("click", () => doExport(true));
  $("expPdfGrid").addEventListener("click", () => doPdf("grid"));
  $("expPdfList").addEventListener("click", () => doPdf("list"));
  $("expStart").addEventListener("change", renderExport);
  $("expEnd").addEventListener("change", renderExport);
}
