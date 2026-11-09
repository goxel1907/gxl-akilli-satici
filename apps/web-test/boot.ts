function showError(error:unknown){
  const box=document.getElementById("fatal-error");
  if(box){box.hidden=false;box.textContent=`Web test başlatılamadı: ${String((error as any)?.message||error).slice(0,300)}`;}
}
window.addEventListener("error",event=>showError(event.error||event.message));
window.addEventListener("unhandledrejection",event=>showError(event.reason));
void import("./entry").catch(showError);
