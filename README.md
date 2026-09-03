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

Songs are listed by the modification time of their newest export, newest first. The selected latest version skips filenames containing `instrumental` when a non-instrumental export is available, without affecting that list order. A song's displayed date is the oldest root-level Ableton `.als` file date, or the oldest audio-version date when no root `.als` exists. **Random Order** temporarily gives the visible list a random order and restores newest-first order when switched off.

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
