// Resolve current WhatsApp identities before constructing a Status audience.
// A named PN contact may have an unnamed LID alias; preserve that verified alias.
export async function resolveStatusAudience(client, inputs) {
  const normalize = j => String(j || '').replace(/:\d+@/, '@');
  const valid = j => /^\d{5,20}@(s\.whatsapp\.net|lid)$/.test(j);
  const original = [...new Set(inputs.map(normalize).filter(valid))];
  const pn = original.filter(j => j.endsWith('@s.whatsapp.net'));
  const aliases = new Map();
  for (let i = 0; i < pn.length; i += 100) {
    const pairs = await client.signalRepository.lidMapping.getLIDsForPNs(pn.slice(i, i + 100));
    for (const pair of pairs || []) {
      const source = normalize(pair.pn), lid = normalize(pair.lid);
      if (valid(source) && /^\d{5,20}@lid$/.test(lid)) aliases.set(source, lid);
    }
  }
  const own = new Set([client.user?.id, client.user?.lid].map(normalize).filter(valid));
  for (const j of [...own]) if (aliases.has(j)) own.add(aliases.get(j));
  const recipients = [...new Set(original.map(j => aliases.get(j) || j))].filter(j => !own.has(j));
  if (!recipients.length) throw new Error('No external Status recipients resolved');
  return recipients;
}
