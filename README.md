# Eternal Moments — Update Notes (v3)

## What was actually broken (and is now fixed + tested)

I loaded this in a real browser (Chromium via Playwright) end-to-end —
intro → password → gallery → music — and fixed both issues you hit.

### 1. "47 songs imported, nothing plays"

**Root cause:** dropping audio files into `/music` is only half the
job — the gallery only loads songs that are *listed* in
`music/playlist.txt`. If that file still has just the instructions
(no filenames added), zero songs load. That's almost certainly what
happened with your 47 files.

**Fixes:**

- **New tool: `music/playlist-builder.html`.** Open it in your
  browser, select all 47 audio files at once (Ctrl/Cmd‑A in the file
  picker), click **Download playlist.txt**, and replace the file in
  `/music` with it. Took ~5 seconds for 47 files in testing — no
  typing required. Each line gets an auto‑generated title
  (`our_song.mp3 | Our Song`), which you can edit before downloading
  if you want a custom title.
- **On-screen diagnostics.** The gallery now tells you what happened,
  via a toast after unlock:
  - *"📁 playlist.txt found, but no songs listed — add filenames
    there"* → the exact situation you were in.
  - *"🎵 Loaded 47 songs from your music folder"* → success.
  - *"📁 Open via http(s):// ..."* → shown if the page is opened by
    double‑clicking the file (`file://`), where `fetch()` can't read
    `playlist.txt` at all.
- **Auto‑play your music.** If any real songs are found, playback now
  starts with your first song instead of the built‑in ambient track.

### 2. "No frames, links to images but showing nothing"

**Root cause:** the 11 built‑in default photos point to
`https://freeimage.host/i/...`, which are that site's *viewer pages*,
not direct image files — and they returned `403 Forbidden` to `<img>`
requests. The old error handling then either left the main image's
`src` pointing at the gallery page itself (blank) or set thumbnail
`<img>`s to `display:none`, leaving empty cream boxes that nearly
vanish against the background.

**Fix:** added a built‑in, self‑contained placeholder (an inline SVG —
no external request) that now shows automatically wherever a photo
fails to load: a soft heart outline with "Add a photo". Verified in
the browser — every frame and thumbnail now shows this until you
upload your own photos, which always work fine since they're stored
directly in the page (no external links involved).

---

## Quick start for your 47 songs

1. Make sure all 47 files are sitting in the `music/` folder.
2. Open `music/playlist-builder.html` in your browser.
3. Click the picker, select all 47 files, click **Download
   playlist.txt**.
4. Replace `music/playlist.txt` with the downloaded file.
5. Reload the gallery — you should see a *"🎵 Loaded 47 songs…"* toast
   and hear your first track automatically.

> Needs `http://` or `https://` hosting (GitHub Pages, Netlify,
> Vercel, etc.) — not opening `index.html` by double‑click — because
> step 5 uses `fetch()` to read `playlist.txt`. If you're testing
> locally, run `python3 -m http.server` in the project folder and
> open `http://localhost:8000`.

---

## Everything else from the previous update

Still included and re‑verified working in this pass: IndexedDB
persistence for songs added via the 🎶 button, the 3D "locket tilt"
main frame, developing‑photo thumbnail entrance, password shake,
drag‑and‑drop overlay, upload spinner, and the music
equalizer/pulse.

## File structure

```
index.html
style.css
script.js
music/
  ├─ playlist.txt           ← lists which songs to load
  └─ playlist-builder.html  ← generates playlist.txt for you
```
