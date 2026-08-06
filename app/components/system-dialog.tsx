"use client";
import { useRef,useState } from "react";

type DialogState={title:string;message:string;kind:"confirm"|"prompt";value:string;confirmLabel:string;danger:boolean}|null;
type Result={confirmed:boolean;value:string};

export function useSystemDialog(){
  const[state,setState]=useState<DialogState>(null);
  const resolver=useRef<((result:Result)=>void)|null>(null);
  function open(options:{title:string;message:string;kind?:"confirm"|"prompt";value?:string;confirmLabel?:string;danger?:boolean}){return new Promise<Result>(resolve=>{resolver.current=resolve;setState({title:options.title,message:options.message,kind:options.kind||"confirm",value:options.value||"",confirmLabel:options.confirmLabel||"Confirmar",danger:!!options.danger})})}
  function close(confirmed:boolean){resolver.current?.({confirmed,value:state?.value||""});resolver.current=null;setState(null)}
  function Dialog(){if(!state)return null;return <div className="system-dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close(false)}}><section className="system-dialog" role="dialog" aria-modal="true" aria-labelledby="system-dialog-title"><span className={state.danger?"dialog-symbol danger":"dialog-symbol"}>{state.danger?"!":"✓"}</span><h2 id="system-dialog-title">{state.title}</h2><p>{state.message}</p>{state.kind==="prompt"&&<input autoFocus value={state.value} maxLength={80} onChange={e=>setState({...state,value:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")close(true)}}/>}<div><button type="button" className="dialog-cancel" onClick={()=>close(false)}>Cancelar</button><button type="button" className={state.danger?"dialog-confirm danger":"dialog-confirm"} onClick={()=>close(true)}>{state.confirmLabel}</button></div></section></div>}
  return{open,Dialog};
}
