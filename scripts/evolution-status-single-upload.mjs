import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const marker = "/* auxplus:status-single-upload:v1 */";
export function patchEvolutionStatus(source) {
  if (source.includes(marker)) return source;
  const startToken = 'if(e==="status@broadcast"){let u;t.status.option.allContacts?';
  const endToken = ',g}return await this.client.sendMessage(e,t,l)';
  const start = source.indexOf(startToken), end = source.indexOf(endToken, start);
  if (start < 0 || end < 0 || source.indexOf(startToken, start + 1) >= 0) throw new Error("Versão incompatível: nenhum arquivo foi alterado.");
  const split = source.indexOf(';let m=10,', start);
  if (split < start || split > end) throw new Error("Fluxo de lotes incompatível: nenhum arquivo foi alterado.");
  const old = source.slice(start, end + 3);
  if (!old.includes('await Promise.allSettled') || !old.includes('messageId:h')) throw new Error("Fluxo de Status não reconhecido: nenhum arquivo foi alterado.");
  const replacement = source.slice(start, split) + `;${marker}const own=[this.client.user?.id,this.client.user?.lid,this.instance?.wuid].filter(Boolean).map(j=>String(j).replace(/:\\d+@/,"@"));const recipients=[...new Set([...own,...u])].filter(j=>/^\\d{5,20}@(s\\.whatsapp\\.net|lid)$/.test(j));if(!recipients.length)throw new Error("No valid status recipients");return await this.client.sendMessage(e,t.status.content,{backgroundColor:t.status.option.backgroundColor,font:t.status.option.font,statusJidList:recipients,broadcast:true})}`;
  return source.slice(0, start) + replacement + source.slice(end + 3);
}

export function checkPatch(source) {
  const patched = patchEvolutionStatus(source);
  // Parse the complete JS before ever writing it into the service.
  new Function(patched);
  return { patched, changed: patched !== source, sha256: crypto.createHash("sha256").update(source).digest("hex") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const action = process.argv[2] || "--check";
  const container = process.argv[3] || "clickpede-app-evolution-api-1";
  if (!["--check", "--apply", "--rollback"].includes(action)) throw new Error("Use --check, --apply ou --rollback e o nome do container.");
  const file = "/evolution/dist/main.js", backup = `${file}.auxplus-status-backup`;
  const run = (code, input) => execFileSync("docker", ["exec", ...(input ? ["-i"] : []), container, "node", "-e", code], { input, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (action === "--rollback") {
    console.log(run(`const fs=require('fs');const file=${JSON.stringify(file)},backup=${JSON.stringify(backup)};if(!fs.existsSync(backup))throw new Error('Backup ausente');if(!fs.readFileSync(file,'utf8').includes(${JSON.stringify(marker)}))throw new Error('O arquivo atual não contém esta correção');fs.copyFileSync(backup,file);console.log('Backup restaurado; reinício do serviço ainda necessário.');`));
  } else {
    const source = run(`process.stdout.write(require('fs').readFileSync(${JSON.stringify(file)},'utf8'));`);
    const { patched, changed, sha256 } = checkPatch(source);
    console.log(JSON.stringify({ action, container, changed, originalSha256: sha256, scope: "Status only; a single Baileys call with explicit audience" }));
    if (action === "--apply" && changed) {
      fs.mkdirSync("tmp/evolution-status-backup", { recursive: true });
      fs.writeFileSync(`tmp/evolution-status-backup/main-${sha256}.js`, source);
      console.log(run(`const fs=require('fs'),crypto=require('crypto');const file=${JSON.stringify(file)},backup=${JSON.stringify(backup)};const current=fs.readFileSync(file);if(crypto.createHash('sha256').update(current).digest('hex')!==${JSON.stringify(sha256)})throw new Error('O arquivo mudou durante a revisão');if(fs.existsSync(backup))throw new Error('Já existe um backup; revise antes de continuar');const patched=fs.readFileSync(0,'utf8');new Function(patched);fs.copyFileSync(file,backup);fs.writeFileSync(file,patched);console.log('Correção instalada com backup. O serviço NÃO foi reiniciado.');`, patched));
    }
  }
}
