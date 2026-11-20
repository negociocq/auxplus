import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FolderTypeTabs} from '../src/components/dashboard/FolderTypeTabs';
import {Tabs,TabsContent} from '../src/components/ui/tabs';
import '../src/globals.css';
function App(){const [active,setActive]=useState<any>('Cliente');const user=new URLSearchParams(location.search).get('user')||'fixture1';return <main className="p-4"><section className="rounded-xl border p-2.5"><h2 className="mb-2 font-semibold">Minhas pastas</h2><Tabs value={active} onValueChange={setActive}><FolderTypeTabs userId={user} onInitialTab={setActive}/>{['Cliente','Produto','Dívida'].map(t=><TabsContent key={t} value={t}><p>Conteúdo {t}</p></TabsContent>)}</Tabs></section></main>}
createRoot(document.getElementById('root')!).render(<App/>);
