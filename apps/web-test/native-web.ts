export * from "react-native-web";

function dialog(title:string,message:string,buttons?:Array<{text:string;style?:string;onPress?:()=>unknown}>){
  const modal=document.createElement("dialog");modal.className="gxl-dialog";modal.setAttribute("aria-label",title);
  const heading=document.createElement("h2");heading.textContent=title;
  const body=document.createElement("p");body.textContent=message;
  modal.append(heading,body);
  const actions=document.createElement("div");actions.className="dialog-actions";
  for(const button of buttons?.length?buttons:[{text:"Tamam"}]){const element=document.createElement("button");element.textContent=button.text;element.type="button";element.onclick=()=>{modal.close();modal.remove();button.onPress?.();};actions.append(element);}
  modal.append(actions);modal.addEventListener("cancel",()=>modal.remove());document.body.append(modal);modal.showModal();
}
export const Alert={alert:dialog};
export const Share={sharedAction:"sharedAction",dismissedAction:"dismissedAction",async share(value:{title?:string;message?:string;url?:string}){
  const modal=document.createElement("dialog");modal.className="gxl-dialog share-dialog";modal.setAttribute("aria-label","Test aktarım metni");
  const heading=document.createElement("h2");heading.textContent=value.title||"Test aktarım metni";
  const note=document.createElement("p");note.textContent="WEB TESTİ: Örnek pazar yanıtlarından hazırlandı. Gerçek rakip analizi, asistan teslimi veya üretim doğrulaması değildir. Metni kopyalamak göndermek anlamına gelmez.";
  const text=document.createElement("textarea");text.setAttribute("aria-label","Asistana aktarım metni");text.readOnly=true;text.value=`WEB TEST ONLY — SYNTHETIC MARKET DATA. DO NOT PUBLISH.\n\n${value.message||value.url||""}`;
  const actions=document.createElement("div");actions.className="dialog-actions";
  for(const [label,action] of [["Metni kopyala",async()=>{try{await navigator.clipboard.writeText(text.value);note.textContent="Kopyalandı. Henüz hiçbir asistana gönderilmedi.";}catch{text.select();note.textContent="Metni seçip tarayıcı menüsünden kopyala.";}}],["TXT indir",()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text.value],{type:"text/plain;charset=utf-8"}));a.download="GXL-WEB-TEST-ONLY.txt";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}],["Kapat",()=>{modal.close();modal.remove();}]] as const){const button=document.createElement("button");button.textContent=label;button.onclick=action;actions.append(button);}
  modal.append(heading,note,text,actions);modal.addEventListener("cancel",()=>modal.remove());document.body.append(modal);modal.showModal();return {action:"sharedAction"};
}};
export const Linking={async openURL(value:string){let url:URL;try{url=new URL(value,location.origin);}catch{throw Error("Geçersiz bağlantı.");}
  if(url.hostname==="www.etsy.com" || url.hostname==="etsy.com" || /shopier|letgo|pinterest|wa\.me|api\.whatsapp/.test(url.hostname)) {dialog("Web test sınırı","Bu test sürümü gerçek satış, mesajlaşma veya hesap sayfasına geçmez. Taslak detaylarını Test araçları bölümünden incele.");return;}
  if(!["https:","http:","blob:"].includes(url.protocol)) {dialog("Web test sınırı","Bu bağlantı Android uygulamasında denenmeli.");return;}
  window.open(url.href,"_blank","noopener,noreferrer");},async canOpenURL(){return true;},addEventListener(){return {remove(){}};},async getInitialURL(){return null;}};
