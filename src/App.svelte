<script lang="ts">
  import { onMount } from "svelte";
  import ContextMenu from "./components/ContextMenu.svelte";
  import PlayerDock from "./components/PlayerDock.svelte";
  import SongCard from "./components/SongCard.svelte";
  import { makeTrack, playLater, playNext, playNow, playQueue } from "./lib/player";
  import type { LibraryResult, ParentFolder, PlayerTrack, Song } from "./lib/types";

  interface MenuState {
    x: number;
    y: number;
    track: PlayerTrack;
    folderId?: string;
  }

  let directory = "";
  let folders: ParentFolder[] = [];
  let selected = new Set<string>();
  let library: LibraryResult | null = null;
  let loadingFolders = false;
  let scanning = false;
  let pickerOpen = false;
  let error = "";
  let notice = "";
  let search = "";
  let menu: MenuState | null = null;

  $: filteredSongs = (library?.songs ?? []).filter((song) => {
    const query = search.trim().toLocaleLowerCase();
    return !query || `${song.name} ${song.latest.filename} ${song.parentFolder}`.toLocaleLowerCase().includes(query);
  });

  async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "The request failed.");
    return body as T;
  }

  async function chooseDirectory(): Promise<void> {
    pickerOpen = true;
    error = "";
    try {
      const result = await api<{ directory: string }>("/api/pick-directory", { method: "POST" });
      directory = result.directory;
      await loadFolders();
    } catch (cause) {
      if (cause instanceof Error && !cause.message.includes("cancelled")) error = cause.message;
    } finally {
      pickerOpen = false;
    }
  }

  async function loadFolders(): Promise<void> {
    if (!directory.trim()) return;
    loadingFolders = true;
    error = "";
    library = null;
    try {
      const result = await api<{ directory: string; folders: ParentFolder[] }>(`/api/folders?directory=${encodeURIComponent(directory.trim())}`);
      directory = result.directory;
      folders = result.folders;
      selected = new Set(result.folders.map(({ name }) => name));
      localStorage.setItem("music-browser-directory", directory);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Could not read that directory.";
      folders = [];
      selected = new Set();
    } finally {
      loadingFolders = false;
    }
  }

  function toggleFolder(name: string): void {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    selected = next;
  }

  async function analyze(): Promise<void> {
    if (!selected.size) return;
    scanning = true;
    error = "";
    notice = "";
    try {
      library = await api<LibraryResult>("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory, includedFolders: [...selected] }),
      });
      notice = library.songs.length
        ? `Found ${library.songs.length} ${library.songs.length === 1 ? "song" : "songs"} across ${library.scannedProjectCount} project folders.`
        : `No versioned MP3 or WAV files were found in ${library.scannedProjectCount} project folders.`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Could not analyze the selected folders.";
    } finally {
      scanning = false;
    }
  }

  function secureRandomIndex(size: number): number {
    const limit = Math.floor(0x1_0000_0000 / size) * size;
    const value = new Uint32Array(1);
    do crypto.getRandomValues(value); while (value[0] >= limit);
    return value[0] % size;
  }

  function shuffle(): void {
    if (!library?.songs.length) return;
    const queue = library.songs.map((song) => makeTrack(song));
    for (let index = queue.length - 1; index > 0; index -= 1) {
      const other = secureRandomIndex(index + 1);
      [queue[index], queue[other]] = [queue[other], queue[index]];
    }
    playQueue(queue);
  }

  function showContext(event: MouseEvent, track: PlayerTrack, folderId?: string): void {
    menu = { x: event.clientX, y: event.clientY, track, folderId };
  }

  function flashError(message: string): void {
    error = message;
    window.setTimeout(() => {
      if (error === message) error = "";
    }, 5000);
  }

  onMount(() => {
    directory = localStorage.getItem("music-browser-directory") ?? "";
  });
</script>

<svelte:head><title>{library ? `${library.songs.length} songs · Music Browser` : "Music Browser"}</title></svelte:head>

<main>
  <header class="site-header">
    <a class="brand" href="/" aria-label="Music Browser home">
      <span class="brand-disc"><i></i></span>
      <span>MUSIC<br />BROWSER</span>
    </a>
    <div class="local-label"><i></i> LOCAL LIBRARY</div>
  </header>

  <section class="hero">
    <div class="setup-panel">
      <div class="step-label"><span>01</span> CHOOSE A DIRECTORY</div>
      <div class="directory-row">
        <label>
          <span class="sr-only">Music directory</span>
          <input bind:value={directory} on:keydown={(event) => event.key === "Enter" && loadFolders()} placeholder="/Users/you/Music/Projects" spellcheck="false" />
        </label>
        <button class="browse-button" type="button" disabled={pickerOpen} on:click={chooseDirectory}>{pickerOpen ? "OPENING…" : "BROWSE"}</button>
        <button class="load-button" type="button" disabled={!directory.trim() || loadingFolders} on:click={loadFolders} aria-label="Load folders">→</button>
      </div>

      {#if loadingFolders}
        <div class="loading-line"><i></i> Reading folders…</div>
      {:else if folders.length}
        <div class="folder-picker">
          <div class="folder-head">
            <div class="step-label"><span>02</span> INCLUDE IN ANALYSIS</div>
            <div><button type="button" on:click={() => (selected = new Set(folders.map(({ name }) => name)))}>ALL</button><button type="button" on:click={() => (selected = new Set())}>NONE</button></div>
          </div>
          <div class="folder-grid">
            {#each folders as folder (folder.name)}
              <label class="folder-check">
                <input type="checkbox" checked={selected.has(folder.name)} on:change={() => toggleFolder(folder.name)} />
                <span class="box">✓</span><span>{folder.name}</span>
              </label>
            {/each}
          </div>
          <button class="analyze-button" type="button" disabled={!selected.size || scanning} on:click={analyze}>
            {scanning ? "ANALYZING…" : `ANALYZE ${selected.size} ${selected.size === 1 ? "FOLDER" : "FOLDERS"}`}
            <span>↗</span>
          </button>
        </div>
      {/if}
    </div>
  </section>

  {#if error}<div class="message error-message" role="alert"><span>!</span>{error}<button type="button" on:click={() => (error = "")}>×</button></div>{/if}

  {#if library}
    <section class="library-section">
      <div class="library-heading">
        <div>
          <p class="eyebrow">LIBRARY / LATEST EXPORTS</p>
          <h2>{library.songs.length} {library.songs.length === 1 ? "song" : "songs"}</h2>
          {#if notice}<p>{notice}</p>{/if}
        </div>
        <button class="shuffle-button" type="button" disabled={!library.songs.length} on:click={shuffle}><span>⌘</span> SHUFFLE ALL</button>
      </div>

      {#if library.songs.length}
        <div class="list-tools">
          <label class="search-box"><span>⌕</span><input bind:value={search} placeholder="Filter songs, files, folders…" /></label>
          <div>{filteredSongs.length} SHOWN</div>
        </div>
        <div class="column-head"><span>SONG</span><span>LATEST VERSION</span><span>HISTORY</span><span>COLLECTION</span><span></span></div>
        <div class="song-list">
          {#each filteredSongs as song (song.id)}
            <SongCard {song} onplay={playNow} oncontext={showContext} />
          {/each}
        </div>
        {#if !filteredSongs.length}<div class="empty-filter">No songs match “{search}”.</div>{/if}
      {:else}
        <div class="empty-library"><span>◌</span><h3>No versioned songs found</h3><p>Files need <code>v1.0</code>, <code>v2.3</code>, or another version number in their name.</p></div>
      {/if}
    </section>
  {/if}
</main>

{#if menu}
  <ContextMenu
    x={menu.x}
    y={menu.y}
    track={menu.track}
    folderId={menu.folderId}
    onclose={() => (menu = null)}
    onnext={playNext}
    onlater={playLater}
    onerror={flashError}
  />
{/if}

<PlayerDock />
