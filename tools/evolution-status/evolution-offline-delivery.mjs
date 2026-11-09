/** Resume the standard WhatsApp offline batches if the initial preview stalls. */
export function recoverOfflineDelivery(socket, options = {}) {
  const delayMs = options.delayMs ?? 5000;
  const quietMs = options.quietMs ?? 5000;
  const maxRequests = options.maxRequests ?? 30;
  const now = options.now || Date.now;
  const schedule = options.setTimeout || setTimeout;
  const cancel = options.clearTimeout || clearTimeout;
  let timer, stopped = false, pending = true, requests = 0, lastMessageAt = 0;
  const stop = () => {
    stopped = true;
    if (timer) cancel(timer);
    socket.ws.off('CB:message', activity);
    socket.ws.off('close', stop);
    socket.ws.off('CB:ib,,offline', completed);
    socket.ev.off('connection.update', connection);
  };
  const arm = () => {
    if (timer) cancel(timer);
    if (!stopped && pending) timer = schedule(pump, delayMs);
  };
  const pump = async () => {
    if (stopped || !pending || !socket.ws.isOpen) return;
    if (lastMessageAt && now() - lastMessageAt < quietMs) { arm(); return; }
    if (requests >= maxRequests) { options.onLimit?.(); stop(); return; }
    requests++;
    try {
      await socket.sendNode({ tag: 'ib', attrs: {}, content: [{ tag: 'offline_batch', attrs: { count: '100' } }] });
      options.onRequest?.(requests);
    } catch { /* A close stops recovery; otherwise try within the finite budget. */ }
    arm();
  };
  const activity = () => { lastMessageAt = now(); };
  const completed = () => { pending = false; stop(); };
  const connection = update => {
    if (update.connection === 'close') { stop(); return; }
    if (update.receivedPendingNotifications === true) { pending = false; stop(); return; }
    if (update.connection === 'open' || update.receivedPendingNotifications === false) arm();
  };
  socket.ws.on('CB:message', activity);
  socket.ws.on('close', stop);
  socket.ws.on('CB:ib,,offline', completed);
  socket.ev.on('connection.update', connection);
  if (socket.ws.isOpen) arm();
  return { stop, stats: () => ({ stopped, pending, requests }) };
}

export function patchOfflineDelivery(source) {
  if (source.includes('/* auxplus:offline-delivery:v1 */')) return source;
  const needle = 'this.client=(0,R.default)(c),this.localSettings.wavoipToken';
  if (source.split(needle).length !== 2) throw new Error('Unrecognized Evolution socket creation');
  return source.replace(needle, `this.client=(0,R.default)(c),/* auxplus:offline-delivery:v1 */this.instance.name==="auxplus-tarciocq1"&&(this.auxplusOfflineRecovery?.stop(),this.auxplusOfflineRecovery=(${recoverOfflineDelivery.toString()})(this.client)),this.localSettings.wavoipToken`);
}
