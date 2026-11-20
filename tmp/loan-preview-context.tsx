import { createContext, useContext, useEffect, useState } from 'react';
const Context = createContext<any>(null);
export const folder = { id: 'loan-fixture', userId: 'fixture', type: 'Produto', name: 'Empréstimos' };
export function Provider({children}: any) {
  const [data,setData] = useState(() => JSON.parse(localStorage.getItem('loan-fixture') || 'null') || { users: [], folders: [folder], folderSettings: [], folderMessages: [], whatsappMessages: [], items: [], tickets: [] });
  useEffect(() => { localStorage.setItem('loan-fixture', JSON.stringify(data)); }, [data]);
  const user = new URLSearchParams(location.search).has('wa') ? {id:folder.userId,username:'fixture'} : undefined;
  return <Context.Provider value={{data,setData,user}}>{children}</Context.Provider>;
}
export const useApp = () => useContext(Context);
