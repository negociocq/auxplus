import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '../src/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '../src/components/ui/alert-dialog';
import {Button} from '../src/components/ui/button';
import {Input} from '../src/components/ui/input';
import {DebtFolderView} from '../src/components/debt/DebtFolderView';
import {Provider} from './loan-preview-context';
import '../src/globals.css';
function App(){
 const [mode,setMode]=useState('');
 const isDebt=new URLSearchParams(location.search).has('debt');
 if(isDebt)return <MemoryRouter><Provider><main className="p-4"><DebtFolderView folder={{id:'loan-fixture',userId:'fixture',type:'Dívida',name:'Dívidas'}}/></main></Provider></MemoryRouter>;
 return <main className="flex flex-wrap gap-3 p-4">{['Formulário','Longo','Três ações','Quatro ações','Largo','Confirmação','Busca'].map(name=><Button key={name} onClick={()=>setMode(name)}>{name}</Button>)}
 <Dialog open={!!mode&&mode!=='Confirmação'} onOpenChange={v=>{if(!v)setMode('')}}>
 <DialogContent className={mode==='Largo'?'flex w-[95vw] max-w-[1200px] flex-col overflow-hidden p-0 sm:max-w-[1200px] sm:p-0':mode==='Busca'?'overflow-hidden p-0':''}>
 <DialogHeader className={mode==='Largo'||mode==='Busca'?'px-4 pt-4 pr-12':''}><DialogTitle>{mode==='Longo'?'Um título longo para conferir a leitura e o botão de fechar no celular':mode}</DialogTitle><DialogDescription>Informações e ações com o padrão visual do AuxPlus.</DialogDescription></DialogHeader>
 <form className={`space-y-3 ${mode==='Largo'||mode==='Busca'?'p-4':''}`} onSubmit={e=>e.preventDefault()}>
 {Array.from({length:mode==='Longo'?16:2},(_,i)=><div key={i}><label htmlFor={`field-${i}`} className="text-sm">Campo {i+1}</label><Input id={`field-${i}`} /></div>)}
 <DialogFooter data-testid="footer"><Button type="button" variant="outline" onClick={()=>setMode('')}>Cancelar</Button>{mode==='Três ações'||mode==='Quatro ações'?<Button type="button">Ativar app</Button>:null}{mode==='Quatro ações'?<Button type="button">Recriar linha</Button>:null}<Button type="button" onClick={()=>setMode('')}>Salvar alterações e continuar</Button></DialogFooter>
 </form></DialogContent></Dialog>
 <AlertDialog open={mode==='Confirmação'} onOpenChange={v=>{if(!v)setMode('')}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar alteração</AlertDialogTitle><AlertDialogDescription>Confira os dados antes de continuar.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter data-testid="footer"><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </main>
}
createRoot(document.getElementById('root')!).render(<App/>);
