<script lang="ts">
  import type { PlayerTrack, Song, SongVersion } from "../lib/types";
  import { makeTrack } from "../lib/player";

  export let song: Song;
  export let onplay: (track: PlayerTrack) => void;
  export let ontogglefavorite: (songId: string) => void;
  export let onpreviewstart: (track: PlayerTrack) => void;
  export let onpreviewend: () => void;
  export let oncontext: (event: MouseEvent, track: PlayerTrack, folderId?: string) => void;
  export let current = false;
  export let playing = false;
  export let highlighted = false;
  export let favorited = false;

  export let expanded = false;
  export let ontoggleexpanded: (songId: string) => void;

  function play(event: MouseEvent, version: SongVersion): void {
    event.stopPropagation();
    onplay(makeTrack(song, version));
  }

  function toggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    ontoggleexpanded(song.id);
  }

  function toggleFavorite(event: MouseEvent): void {
    event.stopPropagation();
    ontogglefavorite(song.id);
  }

  function versionContext(event: MouseEvent, version: SongVersion): void {
    event.preventDefault();
    event.stopPropagation();
    oncontext(event, makeTrack(song, version));
  }

  function cardContext(event: MouseEvent): void {
    event.preventDefault();
    oncontext(event, makeTrack(song), song.folderId);
  }

  function previewStart(event: PointerEvent): void {
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    onpreviewstart(makeTrack(song));
  }

  function previewEnd(event: PointerEvent): void {
    event.stopPropagation();
    onpreviewend();
  }

  function formatDate(timestamp: number): string {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(timestamp);
  }
</script>

<article id={`song-${song.id}`} class:current class:expanded class:highlighted class="song-card" on:contextmenu={cardContext}>
  <button
    class="card-play"
    type="button"
    aria-label={`Play latest version of ${song.name}`}
    on:click={(event) => play(event, song.latest)}
  ></button>

  <div class="song-summary">
    <span class="song-title">
      {#if current}
        <span class:active={playing} class="row-playing-indicator" aria-label={playing ? "Now playing" : "Current song"} title={playing ? "Now playing" : "Current song is paused"}>
          <i></i><i></i><i></i>
        </span>
      {/if}
      <span class="song-name">{song.name}</span>
      <button
        class:active={favorited}
        class="favorite-button"
        type="button"
        aria-label={favorited ? `Remove ${song.name} from favorites` : `Add ${song.name} to favorites`}
        aria-pressed={favorited}
        title={favorited ? "Remove from favorites" : "Add to favorites"}
        on:click={toggleFavorite}
      >{favorited ? "★" : "☆"}</button>
      <button
        class="preview-button"
        type="button"
        aria-label={`Hold to preview ${song.name}`}
        title="Hold to preview from the start"
        on:pointerdown={previewStart}
        on:pointerup={previewEnd}
        on:pointercancel={previewEnd}
        on:lostpointercapture={previewEnd}
        on:click={(event) => event.stopPropagation()}
      >PREVIEW</button>
    </span>
    <time class="song-date first-date" datetime={new Date(song.date).toISOString()}>{formatDate(song.date)}</time>
    <span class="latest-file">{song.latest.filename}</span>
    <time class="song-date latest-date" datetime={new Date(song.latest.modifiedAt).toISOString()}>{formatDate(song.latest.modifiedAt)}</time>
    <span class="count">{song.versions.length} {song.versions.length === 1 ? "version" : "versions"}</span>
    <span class="parent">{song.parentFolder}</span>
    <button
      class="expand-button"
      type="button"
      aria-label={expanded ? `Collapse ${song.name}` : `Show every version of ${song.name}`}
      aria-expanded={expanded}
      on:click={toggleExpanded}
    >
      <svg class="chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.25 6 7.75l3.5-3.5" /></svg>
    </button>
  </div>

  {#if expanded}
    <div class="versions">
      {#each song.versions as version, index (version.id)}
        <button
          type="button"
          class="version-row"
          class:latest={index === 0}
          on:click={(event) => play(event, version)}
          on:contextmenu={(event) => versionContext(event, version)}
        >
          <span class="version-number">{version.version}</span>
          <span class="version-file">{version.filename}</span>
          <time datetime={new Date(version.modifiedAt).toISOString()}>
            {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(version.modifiedAt)}
          </time>
          {#if index === 0}<span class="latest-badge">LATEST</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</article>
