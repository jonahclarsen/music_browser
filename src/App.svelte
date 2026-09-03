<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import ContextMenu from "./components/ContextMenu.svelte";
  import PlayerDock from "./components/PlayerDock.svelte";
  import SongCard from "./components/SongCard.svelte";
  import { makeTrack, player, playLater, playNext, playQueue, restorePlayer } from "./lib/player";
  import type { PlayerState } from "./lib/player";
  import { THEMES, applyTheme, readSavedTheme, setTheme, theme } from "./lib/theme";
  import type { LibraryResult, ParentFolder, PlayerTrack, Song } from "./lib/types";

  interface MenuState {
    x: number;
    y: number;
    track: PlayerTrack;
    folderId?: string;
  }

  interface SavedSession {
    directory: string;
    includedFolders: string[];
    randomOrder: boolean;
    randomSongIds: string[];
    player: {
      queueIds: string[];
      currentIndex: number;
      isPlaying: boolean;
      playlistVisible: boolean;
      position: number;
    };
  }

  const SESSION_KEY = "music-browser-session-v1";

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
  let settingsOpen = false;
  let randomOrder = false;
  let randomSongIds: string[] = [];
  let analyzedFolders: string[] = [];
  let sessionReady = false;
  let saveTimer: number | undefined;

  $: orderedSongs = randomOrder && library
    ? randomSongIds.map((id) => library!.songs.find((song) => song.id === id)).filter((song): song is Song => Boolean(song))
    : library?.songs ?? [];

  $: filteredSongs = orderedSongs.filter((song) => {
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

  async function loadFolders(preferredFolders?: string[] | Event): Promise<void> {
    if (!directory.trim()) return;
    loadingFolders = true;
    error = "";
    try {
      const result = await api<{ directory: string; folders: ParentFolder[] }>(`/api/folders?directory=${encodeURIComponent(directory.trim())}`);
      directory = result.directory;
      folders = result.folders;
      const available = new Set(result.folders.map(({ name }) => name));
      const preferred = Array.isArray(preferredFolders) ? preferredFolders.filter((name) => available.has(name)) : null;
      selected = new Set(preferred ?? result.folders.map(({ name }) => name));
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
      randomOrder = false;
      randomSongIds = [];
      analyzedFolders = [...selected];
      settingsOpen = false;
      if (sessionReady) writeSession();
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

  function shuffleInPlace<T>(items: T[]): T[] {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const other = secureRandomIndex(index + 1);
      [items[index], items[other]] = [items[other], items[index]];
    }
    return items;
  }

  function shuffle(): void {
    if (!library?.songs.length) return;
    playQueue(shuffleInPlace(library.songs.map((song) => makeTrack(song))));
  }

  function playFromList(track: PlayerTrack): void {
    const songIndex = filteredSongs.findIndex(({ folderId }) => folderId === track.folderId);
    const following = songIndex >= 0 ? filteredSongs.slice(songIndex + 1).map((song) => makeTrack(song)) : [];
    playQueue([track, ...following]);
  }

  function toggleRandomOrder(): void {
    randomOrder = !randomOrder;
    randomSongIds = randomOrder && library ? shuffleInPlace(library.songs.map(({ id }) => id)) : [];
    writeSession();
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

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (settingsOpen && event.key === "Escape") settingsOpen = false;
  }

  function writeSession(): void {
    if (!sessionReady || !library) return;
    const state = get(player);
    const saved: SavedSession = {
      directory: library.directory,
      includedFolders: analyzedFolders,
      randomOrder,
      randomSongIds,
      player: {
        queueIds: state.queue.map(({ id }) => id),
        currentIndex: state.currentIndex,
        isPlaying: state.isPlaying,
        playlistVisible: state.playlistVisible,
        position: state.position,
      },
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(saved));
  }

  function scheduleSessionWrite(_state: PlayerState): void {
    if (!sessionReady || saveTimer !== undefined) return;
    saveTimer = window.setTimeout(() => {
      saveTimer = undefined;
      writeSession();
    }, 750);
  }

  function readSavedSession(): SavedSession | null {
    try {
      const value = localStorage.getItem(SESSION_KEY);
      return value ? (JSON.parse(value) as SavedSession) : null;
    } catch {
      return null;
    }
  }

  async function restoreSession(): Promise<void> {
    const saved = readSavedSession();
    directory = saved?.directory ?? localStorage.getItem("music-browser-directory") ?? "";
    if (saved && directory) {
      await loadFolders(saved.includedFolders);
      if (selected.size) await analyze();

      if (library) {
        const validSongIds = new Set(library.songs.map(({ id }) => id));
        const restoredOrder = saved.randomSongIds.filter((id) => validSongIds.has(id));
        const restoredSet = new Set(restoredOrder);
        restoredOrder.push(...library.songs.map(({ id }) => id).filter((id) => !restoredSet.has(id)));
        randomOrder = saved.randomOrder;
        randomSongIds = saved.randomOrder ? restoredOrder : [];

        const tracks = new Map<string, PlayerTrack>();
        for (const song of library.songs) {
          for (const version of song.versions) tracks.set(version.id, makeTrack(song, version));
        }
        const queue: PlayerTrack[] = [];
        let currentIndex = -1;
        saved.player.queueIds.forEach((id, index) => {
          const track = tracks.get(id);
          if (!track) return;
          queue.push(track);
          if (index === saved.player.currentIndex) currentIndex = queue.length - 1;
        });
        restorePlayer(
          queue,
          currentIndex < 0 ? Math.min(saved.player.currentIndex, queue.length - 1) : currentIndex,
          saved.player.isPlaying,
          saved.player.playlistVisible,
          saved.player.position,
        );
      }
    }
    sessionReady = true;
    writeSession();
  }

  onMount(() => {
    theme.set(readSavedTheme());
    const unsubscribeTheme = theme.subscribe(applyTheme);
    const unsubscribe = player.subscribe(scheduleSessionWrite);
    const persistNow = () => writeSession();
    window.addEventListener("pagehide", persistNow);
    void restoreSession();
    return () => {
      unsubscribeTheme();
      unsubscribe();
      window.removeEventListener("pagehide", persistNow);
      if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    };
  });
</script>

<svelte:head><title>{library ? `${library.songs.length} songs · Music Browser` : "Music Browser"}</title></svelte:head>
<svelte:window on:keydown={handleWindowKeydown} />

{#snippet directorySettings()}
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
{/snippet}

<main>
  <header class="site-header">
    <a class="brand" href="/" aria-label="Music Browser home">
      <span class="brand-disc"><i></i></span>
      <span>MUSIC<br />BROWSER</span>
    </a>
    {#if library}
      <button class="settings-button" type="button" on:click={() => (settingsOpen = true)}>
        <svg class="icon-gear" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.8 5.2h12.4M1.8 10.8h12.4" /><circle cx="5.6" cy="5.2" r="1.9" /><circle cx="10.4" cy="10.8" r="1.9" /></svg>
        SETTINGS
      </button>
    {/if}
  </header>

  {#if !library}<section class="hero">{@render directorySettings()}</section>{/if}

  {#if error}<div class="message error-message" role="alert"><span>!</span>{error}<button type="button" on:click={() => (error = "")}>×</button></div>{/if}

  {#if library}
    <section class="library-section">
      <div class="library-heading">
        <div>
          <h2>{library.songs.length} {library.songs.length === 1 ? "song" : "songs"}</h2>
          {#if notice}<p>{notice}</p>{/if}
        </div>
        <button class="shuffle-button" type="button" disabled={!library.songs.length} on:click={shuffle}>
          <svg class="icon-shuffle" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h2.7l7.6 9h2.7M1.5 12.5h2.7l7.6-9h2.7" /><path d="M12.3 1.6 14.5 3.5l-2.2 1.9M12.3 10.6l2.2 1.9-2.2 1.9" /></svg>
          SHUFFLE ALL
        </button>
      </div>

      {#if library.songs.length}
        <div class="list-tools">
          <label class="search-box">
            <svg class="icon-search" viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.9" cy="6.9" r="4.6" /><path d="m10.3 10.3 3.5 3.5" /></svg>
            <input bind:value={search} placeholder="Filter songs, files, folders…" />
          </label>
          <div class="list-actions">
            <button class:active={randomOrder} class="random-order-button" type="button" aria-pressed={randomOrder} on:click={toggleRandomOrder}>
              <span>{randomOrder ? "✓" : ""}</span> RANDOM ORDER
            </button>
            <div>{filteredSongs.length} SHOWN</div>
          </div>
        </div>
        <div class="column-head"><span>SONG</span><span>LATEST VERSION</span><span>HISTORY</span><span>COLLECTION</span><span></span></div>
        <div class="song-list">
          {#each filteredSongs as song (song.id)}
            <SongCard
              {song}
              current={$player.current?.folderId === song.folderId}
              playing={$player.current?.folderId === song.folderId && $player.isPlaying}
              onplay={playFromList}
              oncontext={showContext}
            />
          {/each}
        </div>
        {#if !filteredSongs.length}<div class="empty-filter">No songs match “{search}”.</div>{/if}
      {:else}
        <div class="empty-library"><span>◌</span><h3>No versioned songs found</h3><p>Files need <code>v1.0</code>, <code>v2.3</code>, or another version number in their name.</p></div>
      {/if}
    </section>
  {/if}
</main>

{#if settingsOpen}
  <div class="settings-shell">
    <button class="settings-backdrop" type="button" aria-label="Close settings" on:click={() => (settingsOpen = false)}></button>
    <div class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1">
      <header>
        <div><span>LIBRARY</span><h2 id="settings-title">Settings</h2></div>
        <button type="button" aria-label="Close settings" on:click={() => (settingsOpen = false)}>×</button>
      </header>
      {@render directorySettings()}
      <section class="theme-panel" aria-labelledby="theme-title">
        <div class="step-label" id="theme-title"><span>03</span> APPEARANCE</div>
        <div class="theme-grid" role="radiogroup" aria-label="Theme">
          {#each THEMES as option (option.id)}
            <button
              type="button"
              role="radio"
              class="theme-option"
              class:selected={$theme === option.id}
              aria-checked={$theme === option.id}
              on:click={() => setTheme(option.id)}
            >
              <span class="theme-swatch" data-theme={option.id} aria-hidden="true"><b>Aa</b><i></i><i></i></span>
              <strong>{option.name}{#if $theme === option.id}<span class="theme-check" aria-hidden="true">●</span>{/if}</strong>
              <small>{option.tagline}</small>
            </button>
          {/each}
        </div>
      </section>
    </div>
  </div>
{/if}

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
