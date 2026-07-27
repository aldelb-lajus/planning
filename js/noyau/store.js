/* Cache local, tolérant à l'environnement.

   Ce n'est pas la source de vérité — c'est Supabase — mais c'est ce qui permet
   à l'appli de s'afficher instantanément à l'ouverture, et de rester lisible
   quand le téléphone ne capte pas. */

export const store = {
  async get(k){
    try{ if(window.storage){ const r = await window.storage.get(k); return r ? r.value : null; } }catch(e){}
    try{ return localStorage.getItem(k); }catch(e){ return null; }
  },
  async set(k, v){
    try{ if(window.storage){ await window.storage.set(k, v); return; } }catch(e){}
    try{ localStorage.setItem(k, v); }catch(e){}
  }
};

export const VERSION = 3;

export const emballer = data => JSON.stringify({v:VERSION, data});
export function deballer(brut){
  if(brut == null) return null;
  try{
    const o = JSON.parse(brut);
    return (o && typeof o === "object" && "data" in o) ? o.data : o;
  }catch(e){ return null; }
}
