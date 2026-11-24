// playground.webm: 1. Environment (pull the two Gaussians apart) → 2. Training (time-lapse) → 3. Flow (particles).
// Needs back.py (training runs on the backend). One run takes a few minutes.
// Usage: node playground.mjs [training-seconds-in-video=9] [out]
import { launch, screencast, speedUp, encode, frameDir, sleep, BASE_URL, MEDIA_DIR } from './lib.mjs';
import path from 'node:path';

const TRAIN_VIDEO_S = +(process.argv[2] || 9);
const OUT = process.argv[3] || path.join(MEDIA_DIR, 'playground.webm');
const W = 1600, H = 1010;                       // tall enough for the whole Playground (965 px)

const page = await launch({ width: W, height: H });
await page.goto(BASE_URL + '/', 7000);
await page.evaluate(`document.getElementById('Playground').scrollIntoView({block:'start'})`);
await sleep(2500);
await page.cursor();
const fab = icon => page.center(`[...document.querySelectorAll('.pg-views button')].find(b=>!b.disabled && b.textContent.trim()===${JSON.stringify(icon)})`);
const views = await page.rect('.pg-views');

page.mx = 1500; page.my = 700;
const rec = await screencast(page, frameDir('playground'));
const mark = {};
await sleep(1500);

// 1. Environment: pull the two Gaussians apart (the 2D plot has 44 px per unit)
mark.envStart = Date.now();
const g0 = await page.center(`document.querySelectorAll('.mean-circle')[0]`);
await page.drag(g0.x, g0.y, g0.x - 26, g0.y - 106, 320);   // (-1,-1) → (-1.6, 1.4)
await sleep(300);
const g1 = await page.center(`document.querySelectorAll('.mean-circle')[1]`);
await page.drag(g1.x, g1.y, g1.x + 13, g1.y + 97, 320);    // (1,1) → (1.3, -1.2)
mark.envEnd = Date.now();
await sleep(1200);

// 2. Training with default hyperparameters
const toTraining = await fab('keyboard_double_arrow_right');
await page.click(toTraining.x, toTraining.y, 700);
await sleep(1800);
const play = await fab('play_arrow');
await page.click(play.x, play.y, 700);
mark.trainStart = Date.now();
await page.move(1520, 960, 500);
for (let i = 0; i < 1800; i++) {                // done when the "to Flow" arrow is enabled again
  await sleep(1000);
  if (await fab('keyboard_double_arrow_right')) break;
}
mark.trainEnd = Date.now();
await sleep(2000);

// 3. Flow
const toFlow = await fab('keyboard_double_arrow_right');
await page.click(toFlow.x, toFlow.y, 700);
await page.move(1520, 960, 500);
await sleep(8000);
const frames = await rec.stop();
page.close();

// drags re-render the 3D plot on every mouse move and are slow: compress them to ~3.5 s; training to TRAIN_VIDEO_S
const envS = (mark.envEnd - mark.envStart) / 1000, trainS = (mark.trainEnd - mark.trainStart) / 1000;
speedUp(frames, mark.envStart, mark.envEnd, Math.max(1, envS / 3.5));
speedUp(frames, mark.trainStart + 300, mark.trainEnd, trainS / TRAIN_VIDEO_S);
console.log(`drag ${envS.toFixed(1)} s, training ${trainS.toFixed(1)} s (${(trainS / TRAIN_VIDEO_S).toFixed(1)}x)`);
const crop = { x: views.x - 10, y: Math.max(0, views.y), width: views.width + 20, height: Math.min(views.height, H - views.y) };
encode(frames, OUT, { crop, vw: W, vh: H, holdLast: 0.5 });
