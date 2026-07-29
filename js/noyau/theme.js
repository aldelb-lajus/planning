/* Choix du thème : Auto, Clair, Sombre.

   Trois raisons de ne pas passer par `store` comme le reste de l'appli :

   1. Le thème doit s'appliquer AVANT la première peinture, sinon l'appli
      s'ouvre en blanc puis bascule — un éclair désagréable en pleine nuit.
      `store` est asynchrone ; le petit script en tête d'index.html lit donc
      localStorage en synchrone. Ce fichier écrit au même endroit, sans quoi
      les deux ne parleraient pas de la même chose.

   2. C'est un réglage d'appareil, pas une donnée partagée. Fab peut vouloir
      le sombre sur son téléphone sans l'imposer à Alice — donc rien en base,
      rien dans la synchronisation.

   3. Le mode sombre n'est pas une seconde feuille de style : `data-theme`
      sur <html> ne fait que redéfinir les variables de css/app.css. « Auto »
      n'écrit aucun attribut et laisse `prefers-color-scheme` décider. */

const CLE = "app:theme";
const CHOIX = ["auto", "clair", "sombre"];

export function themeChoisi(){
  try{
    const v = localStorage.getItem(CLE);
    return CHOIX.includes(v) ? v : "auto";
  }catch(e){ return "auto"; }
}

/* Le thème réellement affiché — « auto » résolu par la préférence du système.
   C'est lui qui décide de la couleur de la barre d'état du téléphone. */
function sombreEffectif(choix){
  if(choix === "sombre") return true;
  if(choix === "clair")  return false;
  return !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
}

function appliquer(choix){
  const html = document.documentElement;
  if(choix === "auto") delete html.dataset.theme;
  else html.dataset.theme = choix;

  /* La barre d'état de l'iPhone prend cette couleur : sans mise à jour, elle
     resterait crème au-dessus d'un écran brun foncé. */
  const meta = document.getElementById("metaTheme");
  if(meta) meta.content = sombreEffectif(choix) ? "#1B1916" : "#F5EAD8";
}

export function changerTheme(choix){
  const c = CHOIX.includes(choix) ? choix : "auto";
  try{ localStorage.setItem(CLE, c); }catch(e){}
  appliquer(c);
  majBoutons();
}

function majBoutons(){
  const barre = document.getElementById("themeChoix");
  if(!barre) return;
  const actuel = themeChoisi();
  barre.querySelectorAll("[data-theme]").forEach(b =>
    b.setAttribute("aria-pressed", b.dataset.theme === actuel));
}

export function brancherTheme(){
  appliquer(themeChoisi());
  majBoutons();

  const barre = document.getElementById("themeChoix");
  if(barre) barre.querySelectorAll("[data-theme]").forEach(b =>
    b.addEventListener("click", () => changerTheme(b.dataset.theme)));

  /* En « Auto », le téléphone peut basculer tout seul au coucher du soleil :
     la couleur de barre d'état doit suivre, l'attribut n'a rien à changer. */
  if(window.matchMedia){
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const suivre = () => { if(themeChoisi() === "auto") appliquer("auto"); };
    if(mq.addEventListener) mq.addEventListener("change", suivre);
    else if(mq.addListener) mq.addListener(suivre);
  }
}
