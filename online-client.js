/** ClassMana - API do duelo via HTTP, sem portal Apps Script. */
import { ONLINE_API_URL } from './online-config.js?v=api12';
const KEY='classmana_duelo_api_token_v2';
const rid=()=>crypto.randomUUID();
class Online {
 constructor(){
  this.url=ONLINE_API_URL.replace(/\/$/,'');
  this.enabled=/^https:\/\/[^/]+\/api$/.test(this.url)||/^http:\/\/localhost:\d+\/api$/.test(this.url);
  this.token=sessionStorage.getItem(KEY)||'';
  // Evita várias leituras idênticas do D1 por ranking, arsenal e níveis.
  this.rankData=null;this.rankAt=0;this.rankPending=null;
  this.inboxData=null;this.inboxAt=0;this.inboxPending=null;this.rosterPending=null;
  this.user=null;this.roster=[];this.state='off';this.lastError=null;this.gatewayReady=true;this.apiVersion=0;
 }
 async request(action,method='GET',payload={},requestId){
  if(!this.enabled)throw Error('API do duelo não configurada.');
  const url=new URL(this.url);url.searchParams.set('action',action);
  if(method==='GET')for(const [k,v] of Object.entries(payload))url.searchParams.set(k,String(v));
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
  try{
   const res=await fetch(url,{method,mode:'cors',cache:'no-store',signal:ctrl.signal,
    headers:{'Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{})},
    ...(method==='POST'?{body:JSON.stringify({...payload,...(action!=='login'?{requestId:requestId||rid()}:{})})}:{})});
   const answer=await res.json();if(!res.ok||!answer.ok)throw Error(answer.error||'Servidor indisponível');return answer;
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
  this.invalidateInbox();
  this.token=r.token;this.user=r.user;sessionStorage.setItem(KEY,this.token);localStorage.setItem('cm_arco_nome_v2',id);return this.user}
 logout(){this.token='';this.user=null;this.invalidateInbox();sessionStorage.removeItem(KEY);localStorage.removeItem('cm_arco_nome_v2')}
 async list(){
  if(this.rosterPending)return this.rosterPending;
  const pending=this.get('roster').then(d=>{this.roster=d.players||[];return this.roster}).finally(()=>{if(this.rosterPending===pending)this.rosterPending=null});
  this.rosterPending=pending;return pending;
 }
 async inbox(){
  if(!this.user)throw Error('Escolha seu perfil.');
  if(this.inboxData&&Date.now()-this.inboxAt<10000)return this.inboxData;
  if(this.inboxPending)return this.inboxPending;
  const player=this.user.id;
  const pending=this.get('inbox').then(d=>{
   const rows=d.challenges||[];
   if(this.user?.id===player){this.inboxData=rows;this.inboxAt=Date.now()}
   return rows;
  }).finally(()=>{if(this.inboxPending===pending)this.inboxPending=null});
  this.inboxPending=pending;return pending;
 }
 invalidateInbox(){this.inboxData=null;this.inboxAt=0;this.inboxPending=null}
 async create(kind,to,level='iniciante'){const d=await this.post('challenge',{kind,to,level});this.invalidateInbox();return d.challenge}
 async answer(id,decision){const d=await this.post('answer',{id,decision});this.invalidateInbox();return d.challenge}
 async submit(id,shots){const result=await this.post('submit',{id,shots});this.invalidateRanking();this.invalidateInbox();return result}
 async challenge(id){return(await this.get('challenge',{id})).challenge}
 ranking({fresh=false}={}){
  const now=Date.now();
  if(!fresh&&this.rankData&&now-this.rankAt<30000)return Promise.resolve(this.rankData);
  if(this.rankPending)return this.rankPending;
  const pending=this.get('ranking').then(data=>{
   this.rankData=data;this.rankAt=Date.now();
   return data;
  }).finally(()=>{if(this.rankPending===pending)this.rankPending=null});
  this.rankPending=pending;return pending;
 }
 invalidateRanking(){this.rankData=null;this.rankAt=0}

 portalUrl(){return location.origin+location.pathname}
}
export const online=new Online();
// Uma fonte única de ranking para os demais componentes da V3.
window.classmanaGetRanking=()=>online.ranking();
