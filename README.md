# Music Browser

A fast local browser and player for versioned music exports. It scans your own filesystem, stays bound to `127.0.0.1`, and presents one compact entry per project rather than one entry per audio file.

## Run it

After the one-time global link:

```bash
pnpm link --global
```

start the development app from any Bash or Zsh directory with:

```bash
music_browser
```

The command starts the TypeScript server with live reload and opens [http://localhost:53038](http://localhost:53038). Press `Ctrl+C` in the terminal to stop it.

## Expected folder layout

Choose a root containing collection folders, then select which collections to scan:

```text
Music root/
├── Current/
│   ├── Glass Houses Project/
│   │   └── Exports/
│   │       ├── Glass Houses v1.0.mp3
│   │       └── Glass Houses alt v2.1.wav
│   └── Northern Lights Project/
└── Archive/
```

Each direct child of a selected collection is treated as one song project. Audio exports may be nested anywhere below it. A filename must contain a version such as `v1.0` or `v5.3`; when an MP3 and WAV have the same path and base name, only the MP3 is shown.

Versions are ordered by version number. Files with the same version are ordered by modification date. The song title comes from its project folder, with a trailing ` Project` removed.

Songs are listed by the modification time of their newest export, newest first. The selected latest version skips filenames containing `instrumental` when a non-instrumental export is available, without affecting that list order. **First Date** is the oldest root-level Ableton `.als` file date, or the oldest audio-version date when no root `.als` exists; **Latest Date** is the selected latest export's modification date. **Random Order** temporarily gives the visible list a random order and restores newest-first order when switched off. Favorite songs and the optional favorites-only view are saved in local storage.

## Playback

- Click anywhere on a card to play its latest version.
- Hold **Preview** to audition a song from the beginning without changing the player. Releasing it resumes the player at exactly the position where it was parked.
- Click the card's wide arrow control to expand its version history.
- The current song is marked in the list; its indicator animates while playback is active.
- Right-click a card, version, or the current track in the player for Finder and queue actions.
- **Shuffle All** enables **Random Order**, or reshuffles it when already enabled, then plays from the first song in that order. It uses an unbiased Fisher–Yates shuffle backed by `crypto.getRandomValues`, with one entry per song.
- Playback passes through a lightweight Web Audio gain and dynamics chain. It lifts quiet demos and constrains mastered tracks in real time, avoiding slow preprocessing and duplicate normalized files.
- Returning to a track within ten seconds resumes the position where it was left.
- Click the current song or filename in the bottom player to center and briefly highlight its list row.
- Press Space to play or pause, Left Arrow for the previous track, and Right Arrow for the next track, regardless of which control has keyboard focus.
- Recent scans are reused for five minutes when the root's immediate folder set and selected collections have not changed. List order, queue order, current track, playback position, playing/paused state, and volume are restored from local storage.

## Interface

The Frost appearance is permanent. Interface, display, and technical text use Avenir Next, Helvetica Neue, and Roboto Mono respectively. The compact header, library controls, and player remain fixed while only the song list scrolls.

## Development

```bash
pnpm install
pnpm dev
pnpm check
pnpm test
pnpm build
```

The Svelte frontend and Express API are served together on the same local port. The API keeps opaque IDs for scanned files and supports byte ranges for seeking.

## Sharing

Click the SVG share button immediately left of the play queue button, or right-click a song, version, or current player track and choose **Share song**. This uploads **all scanned versions of that song**, publishes one eight-letter, case-insensitive link, and copies it to your clipboard. The link remains visible with a **Copy link** button if browser clipboard permissions prevent automatic copying. Uploads run in the background while local playback continues.

The standalone page selects the same latest version as Music Browser. Its version picker starts collapsed, and listeners must explicitly choose another version. Playback never advances to another version. Each share is a snapshot; later local edits do not change an existing link. Each version can be up to 95 MiB, with up to 200 versions per share. The scanner's existing MP3-over-WAV preference applies.

The public Worker is `https://music-browser-share.cf-cuicn.workers.dev`, backed by the private `music-browser-shares` R2 bucket. It receives audio files, their basenames, and the selected song title, but no local paths, folder listings, or unrelated songs. Audio is uploaded as-is, including any embedded tags. The Worker makes no requests to localhost; the local Express server remains bound to `127.0.0.1`. There is no public listing endpoint, and pages request no indexing. Anyone with a link can listen, and Cloudflare stores the uploaded copies; links are unlisted, not password protected.

The server reads credentials from `~/.config/music-browser/sharing.json` (keep permissions `0600`):

```json
{
  "url": "https://music-browser-share.cf-cuicn.workers.dev",
  "token": "YOUR_PRIVATE_UPLOAD_TOKEN"
}
```

Alternatively, set `MUSIC_BROWSER_SHARE_URL` and `MUSIC_BROWSER_SHARE_TOKEN`. Credentials stay on the local server and must never be committed or sent to the browser. The matching Worker secret is named `UPLOAD_TOKEN`.

To deploy to another Cloudflare account, update `worker/wrangler.jsonc`, create its R2 bucket, deploy, set the secret, and configure the local server:

```bash
pnpm --use-node-version=22.19.0 exec wrangler r2 bucket create music-browser-shares --config worker/wrangler.jsonc
pnpm share:deploy
pnpm --use-node-version=22.19.0 exec wrangler secret put UPLOAD_TOKEN --config worker/wrangler.jsonc
```

Uploads are streamed one version at a time into a private draft. The Worker publishes the share only after all files are present. Failed uploads trigger cleanup of draft audio; if connectivity also prevents cleanup, unpublished files can remain in R2. Draft IDs remain reserved to prevent accidental reuse. R2 keys use `drafts/<id>`, `shares/<id>`, and `audio/<id>/<version-index>`. Published shares cannot be modified through the upload API.

Only one song's version history can be expanded at a time. That selection is saved with the existing local session. Clicking the current song in the player reveals and expands it, collapsing the previous song.
