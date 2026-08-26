import fs from 'node:fs';
import path from 'node:path';

const root = 'data/raw/attachments';
const pdfs: string[] = [];
(function walk(d: string) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.toLowerCase().endsWith('.pdf')) pdfs.push(p);
  }
})(root);

console.log('pdf files=', pdfs.length);
for (const p of pdfs.slice(0, 4)) {
  const buf = fs.readFileSync(p);
  console.log('---', path.basename(p), 'bytes=', buf.length, 'head=', buf.subarray(0, 8).toString('latin1'));
  try {
    const mod = (await import('pdf-parse')) as unknown as {
      default: (b: Buffer, o?: unknown) => Promise<{ numpages: number; text: string }>;
    };
    const res = await mod.default(buf);
    console.log('   parsed pages=', res.numpages, 'textLen=', res.text.replace(/\s+/g, '').length,
      'sample=', res.text.replace(/\s+/g, ' ').slice(0, 80));
  } catch (e) {
    console.log('   ERROR:', String((e as Error).message).slice(0, 140));
  }
}
