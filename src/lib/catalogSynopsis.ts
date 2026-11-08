/** Plain text only; never render external HTML in the app or banner. */
export function cleanSynopsis(value:unknown):string {
  if(typeof value!=='string')return '';
  return value.replace(/<(script|style|table|sup)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
    .replace(/<[^>]*>/g,' ').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity:string)=>{
      const named:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
      if(entity[0]!=='#')return named[entity.toLowerCase()]||' ';
      const n=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);
      return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';
    }).replace(/\[\s*(?:\d+|editar[^\]]*)\s*\]/gi,'').replace(/\s+/g,' ').replace(/\s+([,.;:!?])/g,'$1').trim();
}
export function shortSynopsis(value:unknown,max=210):string {
  const text=cleanSynopsis(value);if(text.length<=max)return text;
  const end=text.lastIndexOf(' ',max-1);
  return text.slice(0,end>max/2?end:max-1).replace(/[\s,;:]+$/,'')+'…';
}
export function wikipediaSynopsis(html:string):string {
  const headings=/<h([23])\b[^>]*>[\s\S]*?<\/h\1>/gi;
  for(const heading of html.matchAll(headings)){
    const title=cleanSynopsis(heading[0]).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(!/^(enredos?|sinopses?|premissas?|tramas?|argumentos?)(\s|$)/.test(title))continue;
    const after=html.slice(heading.index!+heading[0].length);
    const end=after.search(heading[1]==='2'?/<h[12]\b/i:/<h[123]\b/i),section=end<0?after:after.slice(0,end);
    for(const paragraph of section.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)){
      const text=cleanSynopsis(paragraph[0]);if(text.length>=60)return shortSynopsis(text);
    }
  }
  const lead=html.split(/<h2\b/i)[0];
  for(const paragraph of lead.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)){
    const text=cleanSynopsis(paragraph[0]);
    const sentences=text.match(/[^.!?]+(?:[.!?]+|$)/g)||[];
    const index=sentences.findIndex(s=>/\b(acompanha|segue|narra|retrata|conta a história|gira em torno|se passa|é centrada|é centrado|é ambientada|é ambientado|foca)\b/iu.test(s));
    if(index>=0){const story=sentences.slice(index).join(' ').trim();if(story.length>=60)return shortSynopsis(story);}
  }
  return '';
}
