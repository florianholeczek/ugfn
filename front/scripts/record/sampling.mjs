// continuous.webm: discrete vs. continuous sampling (article Fig. 13 / 14) side by side, one trajectory each.
// Uses 2x screenshots (the plots change only about once per second).
// Usage: node sampling.mjs [seconds=11.6] [out]
// SEED=<int> replaces Math.random with a seeded generator right before the animation starts,
// so a take with good random choices can be picked (and roughly reproduced).
import { launch, shotLoop, encode, frameDir, sleep, BASE_URL, MEDIA_DIR } from './lib.mjs';
import path from 'node:path';

const SECONDS = +(process.argv[2] || 11.6);     // discrete trajectory: 3 × 3.4 s + 1 s reset; continuous: 3 × 3 s + 1 s
const OUT = process.argv[3] || path.join(MEDIA_DIR, 'continuous.webm');
const DPR = 2;

const page = await launch({ dpr: DPR });
await page.goto(BASE_URL + '/', 6000);
await page.evaluate(`document.querySelector('#DC_discrete_plot').scrollIntoView({block:'start'}); window.scrollBy(0,-60)`);
await sleep(1500);
const next = await page.evaluate(`(()=>{const r=document.querySelectorAll('.DC-side-button')[1].getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+300};})()`);
const grid = await page.evaluate(`(()=>{const r=document.querySelector('.DC-center-grid').getBoundingClientRect(); return {x:r.x, y:r.y+scrollY, width:r.width, height:r.height};})()`);

if (process.env.SEED) {   // mulberry32
  await page.evaluate(`Math.random = (a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(${+process.env.SEED})`);
}
const rec = shotLoop(page, frameDir('sampling'), grid);
await sleep(300);
const tClick = Date.now();
await page.click(next.x, next.y, 10);           // switch the figure to "sampling": both animations restart
await sleep(SECONDS * 1000);
const frames = await rec.stop();
// plot positions inside the grid region (CSS px)
const rel = await page.evaluate(`(()=>{const g=document.querySelector('.DC-center-grid').getBoundingClientRect(); const f=s=>{const r=document.querySelector(s).getBoundingClientRect(); return {x:r.x-g.x,y:r.y-g.y,w:r.width,h:r.height};}; return {d:f('#DC_discrete_plot'), c:f('#DC_continuous_plot')};})()`);
page.close();

const sel = frames.filter(f => f.wall >= tClick + 150);
const s = v => Math.round(v * DPR);
const font = "fontfile='C\\:/Windows/Fonts/segoeui.ttf'";
const label = (txt, w) => `drawtext=${font}:text='${txt}':x=(${w}-tw)/2:y=${s(14)}:fontsize=${s(26)}:fontcolor=0x333333`;
const W = s(rel.d.w), H = s(rel.d.h), TOP = s(56), GAP = s(40);
const vf = `split=2[a][b];` +
  `[a]crop=${W}:${H}:${s(rel.d.x)}:${s(rel.d.y)},pad=${W + GAP}:${H + TOP}:0:${TOP}:white,${label('Discrete grid', W)}[a2];` +
  `[b]crop=${W}:${H}:${s(rel.c.x)}:${s(rel.c.y)},pad=${W}:${H + TOP}:0:${TOP}:white,${label('Continuous plane', W)}[b2];` +
  `[a2][b2]hstack=inputs=2,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
encode(sel, OUT, { vf, holdLast: 0.4 });
