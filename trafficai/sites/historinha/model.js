export const flow=['intro','social','1','2','3','4','5','6','fb-rosto','7','8','fb-aventura','9','10','fb-final','11','loading','result','redirect','checkout','aprovado'];
export const initial=()=>({name:'',age:'',gender:'',skin:'',hairColor:'',hairType:'',eyes:'',moral:'',setting:'',email:'',recoveryConsent:false,phone:'',momName:'',special:'',temperament:'',preference:'',commitment:'',discount:false,colorir:false,expressa:false,extra:false});
export function amount(){return 9.9;}
export function validPhone(value){if(!/^[+\d\s().-]+$/.test(String(value||'')))return false;let d=String(value||'').replace(/\D/g,'');if(d.startsWith('55')&&(d.length===12||d.length===13))d=d.slice(2);return /^[1-9]\d(?:9\d{8}|[2-5]\d{7})$/.test(d);}
export function ready(id,s){if(id==='1')return !!s.name.trim()&&!!s.age;if(id==='10')return validPhone(s.phone)&&!!s.momName.trim();return true;}
export function percentage(id){const n=Number(id);return Number.isInteger(n)&&n>=1&&n<=11?Math.round((n-1)/10*100):null;}
export const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);

export function checkoutLink(base,parameters=''){const url=new URL(base);if(url.protocol!=='https:')throw new Error('Checkout precisa usar HTTPS');const source=new URLSearchParams(parameters);for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','sck','quiz_session_id','s1'])if(source.has(key))url.searchParams.set(key,source.get(key));return url.toString();}
