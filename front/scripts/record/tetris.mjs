// tetris.webm: one action selection of the Tetris demo (article Fig. 7), cut so it loops:
// a new piece appears with the three candidate moves → the chosen move is placed.
// Usage: node tetris.mjs [move=3] [out]
import { launch, screencast, encode, frameDir, sleep, BASE_URL, MEDIA_DIR } from './lib.mjs';
import path from 'node:path';

const CYCLE = +(process.argv[2] ?? 3);          // which move of the game (0 = first piece; 3 = a few pieces already placed)
const OUT = process.argv[3] || path.join(MEDIA_DIR, 'tetris.webm');

const page = await launch();
await page.goto(BASE_URL + '/', 6000);
await page.evaluate(`document.querySelector('.A_centerwrap').scrollIntoView({block:'center'})`);
await sleep(1500);
const start = await page.center(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Start Game')`);
await page.click(start.x, start.y, 10);
await sleep(1000);
const wrap = await page.rect('.A_centerwrap');

// log when the candidate list starts computing: that is when a new piece appears
await page.evaluate(`(()=>{ window.__ev=[]; const el=document.getElementById('candidateList');
  new MutationObserver(()=>{ if (el.textContent.includes('computing') && (window.__ev.at(-1)??0) < Date.now()-200) window.__ev.push(Date.now()); })
    .observe(el,{childList:true,subtree:true,characterData:true}); })()`);
const rec = await screencast(page, frameDir('tetris'));
let ev = [];
for (let i = 0; i < 60 && ev.length < CYCLE + 2; i++) { await sleep(500); ev = await page.evaluate('window.__ev'); }
const frames = await rec.stop();
page.close();
if (ev.length < CYCLE + 2) throw new Error(`only ${ev.length} pieces seen`);

const t0 = ev[CYCLE] + 40, t1 = ev[CYCLE + 1] + 20;   // from the new piece (with candidates) to just before the next one
const sel = frames.filter(f => f.wall >= t0 && f.wall < t1);
console.log(`move ${CYCLE}: ${((t1 - t0) / 1000).toFixed(2)} s, ${sel.length} frames`);
const crop = { x: Math.max(0, wrap.x - 20), y: Math.max(0, wrap.y - 10), width: wrap.width + 40, height: wrap.height + 20 };
encode(sel, OUT, { crop, holdLast: (t1 - sel.at(-1).wall) / 1000 });
