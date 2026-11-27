/** ClassMana - API do duelo via HTTP, sem portal Apps Script. */
import { ONLINE_API_URL } from './online-config.js?v=api12';
const KEY='classmana_duelo_api_token_v2';
const rid=()=>crypto.randomUUID();
class Online {
 constructor(){
  this.url=ONLINE_API_URL.replace(/\/$/,'');
  this.enabled=/^https:\/\/[^/]+\/api$/.test(this.url)||/^http:\/\/localhost:\d+\/api$/.test(this.url);
  this.token=sessionStorage.getItem(KEY)||'';
  this.user=null;this.roster=[];this.state='off';this.lastError=null;this.gatewayReady=true;this.apiVersion=0;
 }
 async request(action,method='GET',payload={},requestId){
  if(!this.enabled)throw Error('API do duelo não configurada.');
  const url=new URL(this.url);url.searchParams.set('action',action);
  if(method==='GET')for(const [k,v] of Object.entries(payload))url.searchParams.set(k,String(v));
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
  try{
   // GET público sem Authorization/Content-Type: evita preflight CORS desnecessário.
   const isPublic=method==='GET'&&['ping','roster','ranking'].includes(action);
   const headers={...(method==='POST'?{'Content-Type':'application/json'}:{}),
    ...(!isPublic&&this.token?{Authorization:'Bearer '+this.token}:{})};
   const res=await fetch(url,{method,mode:'cors',cache:'no-store',signal:ctrl.signal,
    headers,
    ...(method==='POST'?{body:JSON.stringify({...payload,...(action!=='login'?{requestId:requestId||rid()}:{})})}:{})});
   const answer=await res.json().catch(()=>null);
   if(!res.ok||!answer?.ok)throw Error((answer?.error||'Servidor indisponível')+' (HTTP '+res.status+')');
   return answer;
  }catch(e){throw Error(e.name==='AbortError'?'O servidor demorou para responder.':e.message)}
  finally{clearTimeout(timer)}
 }
 get(action,params={}){return this.request(action,'GET',params)}
 post(action,payload={}){return this.request(action,'POST',payload)}
 async connect(){
  if(!this.enabled){this.state='off';this.lastError='Configure a URL da API do duelo.';return false}
  this.state='connecting';
  try{const ping=await this.get('ping');if(Number(ping.api)!==12)throw Error('Versão incompatível da API');
   this.apiVersion=12;this.state='ready';this.lastError=null;
   if(this.token){try{this.user=(await this.get('me')).user}catch{this.token='';sessionStorage.removeItem(KEY)}}
   return true
  }catch(e){this.state='error';this.lastError=e.message;throw e}
 }
 async login(id){if(!/^[ABC]\d{2}$/.test(id||''))throw Error('Escolha seu perfil.');const r=await this.post('login',{id});
  this.token=r.token;this.user=r.user;sessionStorage.setItem(KEY,this.token);localStorage.setItem('cm_arco_nome_v2',id);return this.user}
 logout(){this.token='';this.user=null;sessionStorage.removeItem(KEY);localStorage.removeItem('cm_arco_nome_v2')}
 async list(){const d=await this.get('roster');this.roster=d.players||[];return this.roster}
 async inbox(){if(!this.user)throw Error('Escolha seu perfil.');return(await this.get('inbox')).challenges||[]}
 async create(kind,to,level='iniciante'){return(await this.post('challenge',{kind,to,level})).challenge}
 async answer(id,decision){return(await this.post('answer',{id,decision})).challenge}
 async submit(id,shots){return this.post('submit',{id,shots})}
 async challenge(id){return(await this.get('challenge',{id})).challenge}
 // Snapshot de uma resposta REAL da API, apenas para leitura se ela falhar.
 // Não gera vitórias, não altera registros D1 e não autoriza novos duelos.
 ranking(){
  if(this.rankingPending)return this.rankingPending;
  const key='classmana-v3-last-official-ranking';
  const readSaved=()=>{
   try{
    const row=JSON.parse(localStorage.getItem(key)||'null');
    return row&&Array.isArray(row.data?.players)&&Array.isArray(row.data?.classes)&&
      Number.isFinite(row.at)&&Date.now()-row.at<7*86400000?row:null;
   }catch{return null}
  };
  const pending=(async()=>{
   try{
    const data=await this.get('ranking');
    if(!Array.isArray(data.players)||!Array.isArray(data.classes))throw Error('Ranking inválido');
    try{localStorage.setItem(key,JSON.stringify({data,at:Date.now()}))}catch{}
    return data;
   }catch(error){
    const old=readSaved();
    if(old){
     console.warn('[ClassMana V3] Ranking indisponível; usando última resposta oficial confirmada:',error);
     return {...old.data,stale:true,cachedAt:old.at,offlineError:String(error.message||error)};
    }
    throw error;
   }
  })();
  this.rankingPending=pending;
  void pending.finally(()=>{if(this.rankingPending===pending)this.rankingPending=null}).catch(()=>{});
  return pending;
 }
 portalUrl(){return location.origin+location.pathname}
}
export const online=new Online();
