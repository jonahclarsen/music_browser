<script lang="ts">
  import { onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import ContextMenu from "./components/ContextMenu.svelte";
  import PlayerDock from "./components/PlayerDock.svelte";
  import SharedLinks from "./components/SharedLinks.svelte";
  import { uploadTrack } from "./lib/share-client";
  import type { ShareProgress } from "./lib/sharing";
  import SongCard from "./components/SongCard.svelte";
  import { makeTrack, player, playLater, playNext, playQueue, restorePlayer, startPreview, stopPreview } from "./lib/player";
  import type { PlayerState } from "./lib/player";
  import type { LibraryResult, ParentFolder, PlayerTrack, Song } from "./lib/types";

  interface MenuState {
    x: number;
    y: number;
    track: PlayerTrack;
    folderId?: string;
    showQueueActions: boolean;
  }

  interface SavedSession {
    directory: string;
    includedFolders: string[];
    visibleFolders?: string[];
    expandedSongId?: string;
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
  const FAVORITES_KEY = "music-browser-favorites-v1";

  let directory = "";
  let folders: ParentFolder[] = [];
  let selected = new Set<string>();
  let library: LibraryResult | null = null;
  let loadingFolders = false;
  let scanning = false;
  let pickerOpen = false;
  let error = "";
  let search = "";
  let menu: MenuState | null = null;
  let settingsOpen = false;
  let randomOrder = false;
  let randomSongIds: string[] = [];
  let analyzedFolders: string[] = [];
  let visibleFolders = new Set<string>();
  let sessionReady = false;
  let saveTimer: number | undefined;
  let highlightTimer: number | undefined;
  let highlightedSongId = "";
  let favoriteSongIds = new Set<string>();
  let favoritesOnly = false;
  let expandedSongId = "";
  let sharing = false;
  let shareMessage = "";
  let sharedUrl = "";
  let sharedLinksRevision = 0;
  let sharedLinksDialog: HTMLDialogElement;
  let sharedLinksOpen = false;
  let shareProgress: ShareProgress = { phase: "checking", bytes: 0, total: 0, version: 0, versions: 0 };
  $: sharePercent = shareProgress.total ? Math.min(99, Math.floor(shareProgress.bytes / shareProgress.total * 100)) : 0;

  function toggleExpanded(songId: string): void {
    expandedSongId = expandedSongId === songId ? "" : songId;
    writeSession();
  }

  async function copySharedLink(url: string): Promise<void> {
    sharedUrl = url;
    try {
      await navigator.clipboard.writeText(url);
      shareMessage = "copied to clipboard!";
    } catch { shareMessage = "ready to open! Copy its address from the link menu."; }
  }

  async function share(track: PlayerTrack): Promise<void> {
    if (sharing) return;
    sharing = true;
    sharedUrl = "";
    shareProgress = { phase: "checking", bytes: 0, total: 0, version: 0, versions: 0 };
    shareMessage = "Checking existing links";
    const upload = uploadTrack(track.id, progress => {
      shareProgress = progress;
      shareMessage = progress.phase === "checking" ? "Checking existing links"
        : progress.phase === "publishing" ? "Finishing upload"
        : `Uploading version ${progress.version} of ${progress.versions}`;
    });
    // Begin clipboard access during the click, including browsers that require user activation.
    let copying: Promise<boolean> | undefined;
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      try {
        copying = navigator.clipboard.write([new ClipboardItem({
          "text/plain": upload.then(({ url }) => new Blob([url], { type: "text/plain" })),
        })]).then(() => true, () => false);
      } catch { /* A manual copy action remains available after upload. */ }
    }
    try {
      sharedUrl = (await upload).url;
      sharedLinksRevision += 1;
      let copied = copying ? await copying : false;
      if (!copied) {
        try { await navigator.clipboard.writeText(sharedUrl); copied = true; } catch { /* Keep the link visible. */ }
      }
      shareMessage = copied ? "copied to clipboard!" : "ready to open! Copy its address from the link menu.";
    } catch (cause) {
      shareMessage = "";
      flashError(cause instanceof Error ? cause.message : "Could not share this song.");
    } finally { sharing = false; }
  }

  $: orderedSongs = randomOrder && library
    ? randomSongIds.map((id) => library!.songs.find((song) => song.id === id)).filter((song): song is Song => Boolean(song))
    : library?.songs ?? [];

  $: filteredSongs = orderedSongs.filter((song) => {
    const query = search.trim().toLocaleLowerCase();
    return visibleFolders.has(song.parentFolder)
      && (!favoritesOnly || favoriteSongIds.has(song.id))
      && (!query || `${song.name} ${song.latest.filename} ${song.parentFolder}`.toLocaleLowerCase().includes(query));
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
    try {
      library = await api<LibraryResult>("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory, includedFolders: [...selected] }),
      });
      if (!library.songs.some(song => song.id === expandedSongId)) expandedSongId = "";
      randomOrder = false;
      randomSongIds = [];
      analyzedFolders = [...selected];
      visibleFolders = new Set(analyzedFolders);
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
    const shuffledSongs = shuffleInPlace([...library.songs]);
    randomOrder = true;
    randomSongIds = shuffledSongs.map(({ id }) => id);
    playQueue(shuffledSongs.map((song) => makeTrack(song)));
    writeSession();
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

  function toggleVisibleFolder(name: string): void {
    const next = new Set(visibleFolders);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    visibleFolders = next;
    writeSession();
  }

  function readFavorites(): Set<string> {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
      return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : []);
    } catch {
      return new Set();
    }
  }

  function toggleFavorite(songId: string): void {
    const next = new Set(favoriteSongIds);
    if (next.has(songId)) next.delete(songId);
    else next.add(songId);
    favoriteSongIds = next;
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
    } catch {
      // Favorites still work for this session when storage is unavailable.
    }
  }

  function showContext(event: MouseEvent, track: PlayerTrack, folderId?: string, showQueueActions = true): void {
    menu = { x: event.clientX, y: event.clientY, track, folderId, showQueueActions };
  }

  function flashError(message: string): void {
    error = message;
    window.setTimeout(() => {
      if (error === message) error = "";
    }, 5000);
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (sharedLinksDialog?.open) return;
    if (settingsOpen && event.key === "Escape") settingsOpen = false;
  }

  function handleWindowPointerDown(event: PointerEvent): void {
    if (sharedLinksDialog?.open) return;
    if (!settingsOpen || !(event.target instanceof Element)) return;
    if (event.target.closest(".site-header, .settings-drawer")) return;
    settingsOpen = false;
  }

  async function locateSong(folderId: string): Promise<void> {
    const song = library?.songs.find((item) => item.folderId === folderId);
    if (!song) return;
    settingsOpen = false;
    search = "";
    if (!visibleFolders.has(song.parentFolder)) {
      visibleFolders = new Set(visibleFolders).add(song.parentFolder);
      writeSession();
    }
    expandedSongId = song.id;
    favoritesOnly = false;
    writeSession();
    highlightedSongId = "";
    await tick();
    document.getElementById(`song-${song.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightedSongId = song.id;
    if (highlightTimer !== undefined) window.clearTimeout(highlightTimer);
    highlightTimer = window.setTimeout(() => (highlightedSongId = ""), 2400);
  }

  function writeSession(): void {
    if (!sessionReady || !library) return;
    const state = get(player);
    const saved: SavedSession = {
      directory: library.directory,
      includedFolders: analyzedFolders,
      visibleFolders: [...visibleFolders],
      expandedSongId,
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
        const availableFolders = new Set(analyzedFolders);
        visibleFolders = Array.isArray(saved.visibleFolders)
          ? new Set(saved.visibleFolders.filter((name) => availableFolders.has(name)))
          : new Set(analyzedFolders);
        const validSongIds = new Set(library.songs.map(({ id }) => id));
        expandedSongId = saved.expandedSongId && validSongIds.has(saved.expandedSongId) ? saved.expandedSongId : "";
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
        const restoredCurrentIndex = currentIndex < 0 ? Math.min(saved.player.currentIndex, queue.length - 1) : currentIndex;
        restorePlayer(
          queue,
          restoredCurrentIndex,
          saved.player.isPlaying,
          saved.player.playlistVisible,
          saved.player.position,
        );
        const restoredTrack = get(player).current;
        if (saved.player.isPlaying && restoredTrack) {
          const restoredExpansion = expandedSongId;
          await locateSong(restoredTrack.folderId);
          expandedSongId = restoredExpansion;
        }
      }
    }
    sessionReady = true;
    writeSession();
  }

  onMount(() => {
    document.documentElement.dataset.theme = "frost";
    favoriteSongIds = readFavorites();
    const unsubscribe = player.subscribe(scheduleSessionWrite);
    const persistNow = () => writeSession();
    window.addEventListener("pagehide", persistNow);
    void restoreSession();
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", persistNow);
      if (saveTimer !== undefined) window.clearTimeout(saveTimer);
      if (highlightTimer !== undefined) window.clearTimeout(highlightTimer);
      stopPreview();
    };
  });
</script>

<svelte:head><title>Music Browser</title></svelte:head>
<svelte:window on:keydown={handleWindowKeydown} on:pointerdown={handleWindowPointerDown} on:pointerup={stopPreview} on:blur={stopPreview} />

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

<main class:has-library={Boolean(library)}>
  <header class="site-header">
    <a class="brand" href="/" aria-label="Music Browser home">
      <span>Music Browser</span>
    </a>
      <button class:active={settingsOpen} class="settings-button" type="button" aria-expanded={settingsOpen} on:click={() => (settingsOpen = !settingsOpen)}>
        <svg class="icon-gear" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 2h5l.5 2.5 2 1.2 2.4-.8 2.5 4.2-1.9 1.7v2.4l1.9 1.7-2.5 4.2-2.4-.8-2 1.2-.5 2.5h-5L9 19.5l-2-1.2-2.4.8-2.5-4.2L4 13.2v-2.4L2.1 9.1l2.5-4.2 2.4.8 2-1.2L9.5 2ZM15.5 12a3.5 3.5 0 1 0-7 0 3.5 3.5 0 0 0 7 0Z" /></svg>
        SETTINGS
      </button>
  </header>
    <div class:open={settingsOpen} class="settings-drawer" inert={!settingsOpen}>
      <div class="settings-drawer-inner">
        <section class="settings-panel" aria-labelledby="settings-title">
          <header>
            <h2 id="settings-title">Settings</h2>
            <button type="button" aria-label="Close settings" on:click={() => (settingsOpen = false)}>×</button>
          </header>
          <div class="settings-content">
            {#if library}{@render directorySettings()}{/if}
            <div class="settings-sharing"><button class="settings-button" type="button" on:click={() => { sharedLinksOpen = true; sharedLinksDialog.showModal(); }}>Manage shared links</button></div>
          </div>
        </section>
      </div>
    </div>

  {#if !library}<section class="hero">{@render directorySettings()}</section>{/if}

  {#if error}<div class="message error-message" role="alert"><span>!</span>{error}<button type="button" on:click={() => (error = "")}>×</button></div>{/if}


  {#if library}
    <section class="library-section" aria-label="Song library">
      <div class="list-tools">
        <label class="search-box">
          <svg class="icon-search" viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.9" cy="6.9" r="4.6" /><path d="m10.3 10.3 3.5 3.5" /></svg>
          <input bind:value={search} placeholder="Filter songs, files, folders…" />
          {#if search}<button class="clear-search" type="button" aria-label="Clear filter" on:click={() => (search = "")}>×</button>{/if}
        </label>
        <div class="list-actions">
          <div class="folder-filters" role="group" aria-label="Folders shown in song list">
            {#each analyzedFolders as folder (folder)}
              <label class:active={visibleFolders.has(folder)} class="folder-filter">
                <input type="checkbox" checked={visibleFolders.has(folder)} on:change={() => toggleVisibleFolder(folder)} />
                <span class="folder-filter-check">{visibleFolders.has(folder) ? "✓" : ""}</span>
                <span class="folder-filter-name">{folder}</span>
              </label>
            {/each}
          </div>
          <button class:active={randomOrder} class="random-order-button" type="button" aria-pressed={randomOrder} on:click={toggleRandomOrder}>
            <span>{randomOrder ? "✓" : ""}</span> RANDOM ORDER
          </button>
          <button class:active={favoritesOnly} class="favorites-filter-button" type="button" aria-pressed={favoritesOnly} on:click={() => (favoritesOnly = !favoritesOnly)}>
            <span aria-hidden="true">{favoritesOnly ? "★" : "☆"}</span> FAVORITES
          </button>
          <button class="shuffle-button" type="button" disabled={!library.songs.length} on:click={shuffle}>
            <svg class="icon-shuffle" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h2.7l7.6 9h2.7M1.5 12.5h2.7l7.6-9h2.7" /><path d="M12.3 1.6 14.5 3.5l-2.2 1.9M12.3 10.6l2.2 1.9-2.2 1.9" /></svg>
            SHUFFLE ALL
          </button>
        </div>
      </div>

      {#if library.songs.length}
        <div class="column-head"><span>TITLE</span><span>FIRST DATE</span><span>LATEST VERSION</span><span>LATEST DATE</span><span>VERSION COUNT</span><span>STATUS</span><span></span></div>
        <div class="song-list">
          {#each filteredSongs as song (song.id)}
            <SongCard
              {song}
              expanded={expandedSongId === song.id}
              ontoggleexpanded={toggleExpanded}
              current={$player.current?.folderId === song.folderId}
              playing={$player.current?.folderId === song.folderId && $player.isPlaying}
              highlighted={highlightedSongId === song.id}
              favorited={favoriteSongIds.has(song.id)}
              onplay={playFromList}
              ontogglefavorite={toggleFavorite}
              onpreviewstart={startPreview}
              onpreviewend={stopPreview}
              oncontext={showContext}
            />
          {/each}
        </div>
        {#if !filteredSongs.length}
          <div class="empty-filter">
            {search.trim() ? `No songs match “${search}”.` : favoritesOnly ? "No favorite songs match the selected folders." : "No songs match the selected folders."}
          </div>
        {/if}
      {:else}
        <div class="empty-library"><span>◌</span><h3>No versioned songs found</h3><p>Files need <code>v1.0</code>, <code>v2.3</code>, or another version number in their name.</p></div>
      {/if}
    </section>
  {/if}
</main>

<dialog bind:this={sharedLinksDialog} class="shared-links-modal" aria-label="Shared links" on:click={(event) => { if (event.target === sharedLinksDialog) sharedLinksDialog.close(); }} on:close={() => (sharedLinksOpen = false)}>
  <div class="shared-links-modal-content">
    <button class="modal-close" type="button" aria-label="Close shared links" on:click={() => sharedLinksDialog.close()}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></button>
    {#if sharedLinksOpen}{#key sharedLinksRevision}<SharedLinks oncopy={copySharedLink} />{/key}{/if}
    {#if shareMessage && !sharing}<p role="status">Link {shareMessage}</p>{/if}
  </div>
</dialog>

{#if menu}
  <ContextMenu
    x={menu.x}
    y={menu.y}
    track={menu.track}
    folderId={menu.folderId}
    showQueueActions={menu.showQueueActions}
    onclose={() => (menu = null)}
    onnext={playNext}
    onlater={playLater}
    onerror={flashError}
    onshare={share}
    {sharing}
  />
{/if}

{#if shareMessage}
  <div class="share-notice" role="status" aria-live="polite">
    {#if sharing}
      <div class="share-progress-label"><span>{shareMessage}</span><span>{sharePercent}%</span></div>
      <progress max="100" value={sharePercent} aria-label="Song upload progress"></progress>
    {:else}
      <span><a href={sharedUrl} target="_blank" rel="noreferrer">Link</a> {shareMessage}</span>
    {/if}
    {#if !sharing}<button class="dismiss-share" type="button" aria-label="Dismiss share notification" on:click={() => (shareMessage = "")}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></button>{/if}
  </div>
{/if}

<PlayerDock
  onshare={share}
  {sharing}
  onlocate={locateSong}
  oncontext={(event, track, folderId) => showContext(event, track, folderId, false)}
/>
