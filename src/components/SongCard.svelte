<script lang="ts">
  import type { PlayerTrack, Song, SongVersion } from "../lib/types";
  import { makeTrack } from "../lib/player";

  export let song: Song;
  export let onplay: (track: PlayerTrack) => void;
  export let oncontext: (event: MouseEvent, track: PlayerTrack, folderId?: string) => void;

  let expanded = false;

  function play(event: MouseEvent, version: SongVersion): void {
    event.stopPropagation();
    onplay(makeTrack(song, version));
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

<article class:expanded class="song-card" on:contextmenu={cardContext}>
  <button
    class="card-toggle"
    type="button"
    aria-label={expanded ? `Collapse ${song.name}` : `Show every version of ${song.name}`}
    aria-expanded={expanded}
    on:click={() => (expanded = !expanded)}
  ></button>

  <div class="song-summary">
    <button class="text-action song-name" type="button" title="Play latest" on:click={(event) => play(event, song.latest)}>
      {song.name}
    </button>
    <button class="text-action latest-file" type="button" title="Play latest" on:click={(event) => play(event, song.latest)}>
      {song.latest.filename}
    </button>
    <button class="text-action count" type="button" title="Play latest" on:click={(event) => play(event, song.latest)}>
      {song.versions.length} {song.versions.length === 1 ? "version" : "versions"}
    </button>
    <button class="text-action parent" type="button" title="Play latest" on:click={(event) => play(event, song.latest)}>
      {song.parentFolder}
    </button>
    <span class="chevron" aria-hidden="true">⌄</span>
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

