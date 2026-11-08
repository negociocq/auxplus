import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const marker = "/* auxplus:own-status-device-sync:v1 */";
export function ownStatusSync(isStatus, destinationJid, message, distribution) {
  return isStatus ? { deviceSentMessage: { destinationJid, message: { ...message, senderKeyDistributionMessage: distribution } } } : undefined;
}
export function patchOwnStatusSync(source) {
  if (source.includes(marker)) return source;
  const old = "const result = await createParticipantNodes(senderKeyRecipients, senderKeyMsg, extraAttrs);";
  if (source.split(old).length !== 2 || !source.includes("if (dsmMessage)") || !source.includes("isOwnUser && !isExactSenderDevice")) throw new Error("Biblioteca incompatível; nenhum arquivo foi alterado.");
  const code = `${marker}
                const ownStatusSync = isStatus ? {
                    deviceSentMessage: {
                        destinationJid,
                        message: { ...patched, senderKeyDistributionMessage: senderKeyMsg.senderKeyDistributionMessage }
                    }
                } : undefined;
                const result = await createParticipantNodes(senderKeyRecipients, senderKeyMsg, extraAttrs, ownStatusSync);`;
  return source.replace(old, code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const action = process.argv[2] || "--check", container = process.argv[3] || "clickpede-app-evolution-api-1";
  if (!["--check", "--apply", "--rollback"].includes(action)) throw new Error("Use --check, --apply ou --rollback.");
  const file = "/evolution/node_modules/baileys/lib/Socket/messages-send.js", backup = `${file}.auxplus-own-status-backup`;
  const run = (code, input) => execFileSync("docker", ["exec", ...(input ? ["-i"] : []), container, "node", "-e", code], { input, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (action === "--rollback") {
    console.log(run(`const fs=require('fs');const file=${JSON.stringify(file)},backup=${JSON.stringify(backup)};if(!fs.existsSync(backup)||!fs.readFileSync(file,'utf8').includes(${JSON.stringify(marker)}))throw new Error('Backup/correção não encontrados');fs.copyFileSync(backup,file);console.log('Sincronização restaurada; reinício necessário.');`));
  } else {
    const source = run(`process.stdout.write(require('fs').readFileSync(${JSON.stringify(file)},'utf8'));`);
    const patched = patchOwnStatusSync(source);
    execFileSync(process.execPath, ["--check", "--input-type=module"], { input: patched, encoding: "utf8" });
    const sha256 = crypto.createHash("sha256").update(source).digest("hex");
    console.log(JSON.stringify({ action, changed: patched !== source, originalSha256: sha256, scope: "Own-device DSM only for Status; groups and contact encryption unchanged" }));
    if (action === "--apply" && patched !== source) {
      fs.mkdirSync("tmp/evolution-status-backup", { recursive: true });
      fs.writeFileSync(`tmp/evolution-status-backup/baileys-messages-send-${sha256}.js`, source);
      console.log(run(`const fs=require('fs'),crypto=require('crypto');const file=${JSON.stringify(file)},backup=${JSON.stringify(backup)};const current=fs.readFileSync(file);if(crypto.createHash('sha256').update(current).digest('hex')!==${JSON.stringify(sha256)}||fs.existsSync(backup))throw new Error('Arquivo mudou ou já existe backup');fs.copyFileSync(file,backup);fs.writeFileSync(file,fs.readFileSync(0,'utf8'));console.log('Sincronização instalada com backup. O serviço não foi reiniciado.');`, patched));
    }
  }
}
