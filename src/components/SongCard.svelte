<script lang="ts">
  import type { PlayerTrack, Song, SongVersion } from "../lib/types";
  import { makeTrack } from "../lib/player";

  export let song: Song;
  export let onplay: (track: PlayerTrack) => void;
  export let oncontext: (event: MouseEvent, track: PlayerTrack, folderId?: string) => void;
  export let current = false;
  export let playing = false;

  let expanded = false;

  function play(event: MouseEvent, version: SongVersion): void {
    event.stopPropagation();
    onplay(makeTrack(song, version));
  }

  function toggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    expanded = !expanded;
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
</script>

<article class:current class:expanded class="song-card" on:contextmenu={cardContext}>
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
    </span>
    <span class="latest-file">{song.latest.filename}</span>
    <span class="count">{song.versions.length} {song.versions.length === 1 ? "version" : "versions"}</span>
    <span class="parent">{song.parentFolder}</span>
    <button
      class="expand-button"
      type="button"
      aria-label={expanded ? `Collapse ${song.name}` : `Show every version of ${song.name}`}
      aria-expanded={expanded}
      on:click={toggleExpanded}
    >
      <span class="chevron" aria-hidden="true">⌄</span>
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
