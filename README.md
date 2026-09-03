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

The command starts the TypeScript server with live reload and opens [http://localhost:5173](http://localhost:5173). Press `Ctrl+C` in the terminal to stop it.

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

Songs are listed by the modification time of their latest export, newest first. **Random Order** temporarily gives the visible list a random order and restores newest-first order when switched off.

## Playback

- Click summary text to play the latest version.
- Click the surrounding card to expand its version history.
- Right-click a card or version for Finder and queue actions.
- **Shuffle All** uses an unbiased Fisher–Yates shuffle backed by `crypto.getRandomValues`, with one entry per song.
- Playback passes through a lightweight Web Audio gain and dynamics chain. It lifts quiet demos and constrains mastered tracks in real time, avoiding slow preprocessing and duplicate normalized files.
- The selected library is rescanned at launch. List order, queue order, current track, playback position, and playing/paused state are restored from local storage after that scan.

## Development

```bash
pnpm install
pnpm dev
pnpm check
pnpm test
pnpm build
```

The Svelte frontend and Express API are served together on the same local port. The API keeps opaque IDs for scanned files and supports byte ranges for seeking.
