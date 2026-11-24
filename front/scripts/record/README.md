# Talk videos

Scripts that record the videos used in `present.html` (`front/public/present/media/`).
They drive headless Chrome through the DevTools protocol (clicks and drags are real mouse input,
shown with a teal cursor dot) and encode the frames to VP9 WebM with ffmpeg.

| Script | Output | What it shows |
|---|---|---|
| `tetris.mjs` | `tetris.webm` | One action selection of the Tetris demo, cut so it loops |
| `sampling.mjs` | `continuous.webm` | Discrete vs. continuous sampling side by side, one trajectory each |
| `playground.mjs` | `playground.webm` | Environment → training (time-lapse) → flow |

## Requirements

- Node ≥ 22 (uses the built-in `WebSocket` and `fetch`; no npm packages)
- Chrome (or Edge via `CHROME=...msedge.exe`)
- ffmpeg with `libvpx-vp9`, on `PATH` or via `FFMPEG=...`.
  Without an ffmpeg install: `pip install imageio-ffmpeg` and point `FFMPEG` to
  `python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"`.
- The site running with the backend: from the repo root, `python -m uvicorn back:app --port 8000`
  (serves `front/public` and the training API). Other port: `BASE_URL=http://localhost:8001`.

## Run

From `front/scripts/record/`:

```powershell
node tetris.mjs        # optional: which move of the game (default 3, counted from 0), output path
node sampling.mjs      # optional: seconds to record (default 11.6), output path
node playground.mjs    # optional: seconds the training takes in the video (default 9), output path
```

The Playground run trains the model on the backend (about 3–4 minutes on CPU).
Frames are kept in `%TEMP%\gfn-record\` until the next run.

## Notes

- `tetris.mjs` and `playground.mjs` use Chrome's screencast, which delivers frames at CSS-pixel size
  (1×, about 30 fps). `sampling.mjs` uses 2× screenshots instead (about 5 fps, enough for that animation).
- Timing is taken from the frames' timestamps, so the videos play at real speed except for the
  segments that are explicitly sped up (Playground drags and training).
