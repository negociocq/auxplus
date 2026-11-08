/** Evolution 2.3.7: keep connection lifecycle outside the owner's message queue. */
export function inboundDeadline(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('AuxPlus auxiliary query deadline')), ms);
  })]).finally(() => clearTimeout(timer));
}

export function patchInboundQueue(source) {
  const marker = '/* auxplus:inbound-queue:v1 */';
  if (source.includes(marker)) return source;
  function replaceOnce(before, after) {
    if (source.split(before).length !== 2) throw new Error('Unrecognized Evolution source: ' + before);
    source = source.replace(before, after);
  }
  const owner = 'this.instance.name==="auxplus-tarciocq1"';
  replaceOnce('this.client.ev.process(async e=>{',
    `this.client.ev.process(async e=>{${marker}if(${owner}){const update=e["connection.update"];if(update){delete e["connection.update"];void this.connectionUpdate(update).catch(error=>this.logger.error(error))}if(e["creds.update"]){delete e["creds.update"];void this.instance.authState.saveCreds().catch(error=>this.logger.error(error))}}`);
  replaceOnce('connectTimeoutMs:3e4,keepAliveIntervalMs:3e4,',
    `...(${owner}?{defaultQueryTimeoutMs:8000}:{}),connectTimeoutMs:3e4,keepAliveIntervalMs:3e4,`);
  replaceOnce('let o=await this.client.profilePictureUrl(t,"image");',
    `let o=await (${owner}?(${inboundDeadline.toString()})(this.client.profilePictureUrl(t,"image"),2000):this.client.profilePictureUrl(t,"image"));`);
  const read = 'await this.client.readMessages([n.key])';
  if (source.split(read).length !== 3) throw new Error('Unrecognized read-receipt source');
  source = source.split(read).join(`await (${owner}?(${inboundDeadline.toString()})(this.client.readMessages([n.key]),2000).catch(()=>{}):this.client.readMessages([n.key]))`);
  return source;
}
