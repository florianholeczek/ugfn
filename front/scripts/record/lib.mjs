// Shared helpers for recording the talk videos: a minimal headless-Chrome driver over the
// DevTools protocol (Node >= 22: global WebSocket/fetch, no npm packages) and ffmpeg encoding.
//
// Environment variables:
//   CHROME    path to chrome.exe / msedge.exe   (default: standard Chrome install path)
//   FFMPEG    path to an ffmpeg with libvpx-vp9 (default: "ffmpeg" on PATH)
//   BASE_URL  site to record                    (default: http://localhost:8000, i.e. back.py serving front/public)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const FFMPEG = process.env.FFMPEG || 'ffmpeg';
export const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';
export const MEDIA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/present/media');
export const WORK_DIR = path.join(os.tmpdir(), 'gfn-record');
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Fresh, empty frame folder for one recording.
export function frameDir(name) {
  const d = path.join(WORK_DIR, name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export async function launch({ width = 1600, height = 900, dpr = 1, port = 9333 } = {}) {
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(WORK_DIR, 'profile')}`,
    '--hide-scrollbars', '--no-first-run', '--lang=en-US', '--blink-settings=preferredColorScheme=1',
    `--window-size=${Math.round(width * dpr)},${Math.round(height * dpr)}`, 'about:blank',
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
  }
  if (!target) { proc.kill(); throw new Error(`Chrome did not start (CHROME=${CHROME})`); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const listeners = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method && listeners.has(m.method)) listeners.get(m.method)(m.params);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  return {
    send, evaluate, width, height, dpr,
    on: (method, fn) => listeners.set(method, fn),
    async goto(url, waitMs = 4000) { await send('Page.navigate', { url }); await sleep(waitMs); },
    // viewport rect of an element (CSS px)
    rect: (sel) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.left,y:r.top,width:r.width,height:r.height};})()`),
    // centre of the element returned by a JS expression
    center: (expr) => evaluate(`(()=>{const e=${expr}; if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`),
    // fake cursor so viewers see where we click / drag (headless Chrome draws none)
    async cursor() {
      await evaluate(`(()=>{ if (window.__cur) return; const d=document.createElement('div');
        d.style.cssText='position:fixed;z-index:2147483647;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(33,145,140,.35);border:3px solid #21918c;pointer-events:none;transition:transform .12s;display:none';
        document.body.appendChild(d);
        window.__cur=(x,y,down)=>{d.style.display='block';d.style.left=x+'px';d.style.top=y+'px';d.style.transform=down?'scale(.7)':'scale(1)';}; })()`);
    },
    mx: 0, my: 0, down: false,
    async move(x, y, ms = 600) {
      const steps = Math.max(1, Math.round(ms / 16)), x0 = this.mx, y0 = this.my;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        const cx = x0 + (x - x0) * e, cy = y0 + (y - y0) * e;
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, button: this.down ? 'left' : 'none', buttons: this.down ? 1 : 0 });
        await evaluate(`window.__cur&&window.__cur(${cx},${cy},${this.down})`);
        await sleep(16);
      }
      this.mx = x; this.my = y;
    },
    async press() { this.down = true; await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: this.mx, y: this.my, button: 'left', buttons: 1, clickCount: 1 }); await evaluate(`window.__cur&&window.__cur(${this.mx},${this.my},true)`); },
    async release() { this.down = false; await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: this.mx, y: this.my, button: 'left', buttons: 0, clickCount: 1 }); await evaluate(`window.__cur&&window.__cur(${this.mx},${this.my},false)`); },
    async click(x, y, ms = 600) { await this.move(x, y, ms); await sleep(150); await this.press(); await sleep(120); await this.release(); },
    async drag(x0, y0, x1, y1, ms = 1200) { await this.move(x0, y0); await sleep(150); await this.press(); await sleep(100); await this.move(x1, y1, ms); await sleep(100); await this.release(); },
    close() { try { ws.close(); } catch {} proc.kill(); },
  };
}

// Screencast recorder: Chrome pushes a frame (viewport, at CSS-pixel size) whenever the page repaints.
// Each frame keeps Chrome's timestamp (t, for durations) and the wall clock on arrival (wall, comparable to Date.now()).
export async function screencast(page, dir) {
  const frames = []; let n = 0;
  page.on('Page.screencastFrame', p => {
    page.send('Page.screencastFrameAck', { sessionId: p.sessionId });
    const file = path.join(dir, `f${String(n++).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(p.data, 'base64'));
    frames.push({ file, t: p.metadata.timestamp * 1000, wall: Date.now(), speed: 1 });
  });
  await page.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 });
  return { frames, async stop() { await page.send('Page.stopScreencast'); await sleep(200); return frames; } };
}

// Screenshot loop for one document-coordinate region at the page's device scale (sharper, ~5 fps):
// good for content that changes only a few times per second.
export function shotLoop(page, dir, clip) {
  const frames = []; let n = 0, running = true;
  const done = (async () => {
    while (running) {
      const t = Date.now();
      const r = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, clip: { ...clip, scale: 1 } });
      const file = path.join(dir, `f${String(n++).padStart(5, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      frames.push({ file, t, wall: t, speed: 1 });
    }
  })();
  return { frames, async stop() { running = false; await done; return frames; } };
}

// Speed up all frames whose arrival time lies in [from, to).
export function speedUp(frames, from, to, factor) {
  for (const f of frames) if (f.wall >= from && f.wall < to) f.speed = factor;
}

// Encode frames with variable timing to a constant-frame-rate VP9 WebM.
//   crop:     viewport CSS-px rect {x,y,width,height} (vw/vh: viewport size the frames show)
//   vf:       custom filter graph instead of crop (gets [0:v] after fps)
//   holdLast: seconds to show the last frame
export function encode(frames, out, { fps = 30, crop, vw = 1600, vh = 900, holdLast = 0, vf = null } = {}) {
  const list = path.join(path.dirname(frames[0].file), 'list.txt');
  let txt = '';
  frames.forEach((f, i) => {
    const nxt = frames[i + 1];
    const d = nxt ? (nxt.t - f.t) / 1000 / f.speed : Math.max(holdLast, 1 / fps);
    txt += `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(d, 0.001).toFixed(4)}\n`;
  });
  txt += `file '${frames.at(-1).file.replace(/\\/g, '/')}'\n`;
  fs.writeFileSync(list, txt);
  const c = crop ? `crop=iw*${crop.width / vw}:ih*${crop.height / vh}:iw*${crop.x / vw}:ih*${crop.y / vh},` : '';
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    ...(vf ? ['-filter_complex', `[0:v]fps=${fps},${vf}`] : ['-vf', `${c}fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2`]),
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-pix_fmt', 'yuv420p', '-an', out]);
  console.log('written', out);
}
