<script lang="ts">
  import { onMount } from "svelte";
  import { moveQueue, player, preview, removeQueueItem, selectQueueIndex, setPlaying, setPosition, togglePlaylist } from "../lib/player";

  export let onlocate: (folderId: string) => void;

  const VOLUME_KEY = "music-browser-volume";
  const DEFAULT_VOLUME = 0.72;

  let audio: HTMLAudioElement;
  let previewAudio: HTMLAudioElement;
  let audioContext: AudioContext | null = null;
  let volumeGain: GainNode | null = null;
  let loadedId = "";
  let loadedPreviewId = "";
  let volume = DEFAULT_VOLUME;
  let elapsed = 0;
  let duration = 0;
  let pendingPosition = 0;

  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds)) return "0:00";
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }

  function formatDate(timestamp: number): string {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(timestamp);
  }

  function setupAudioGraph(): void {
    if (audioContext || !audio || !previewAudio) return;
    audioContext = new AudioContext();
    const inputGain = audioContext.createGain();
    const compressor = audioContext.createDynamicsCompressor();
    const outputGain = audioContext.createGain();
    volumeGain = audioContext.createGain();

    inputGain.gain.value = 7.5;
    compressor.threshold.value = -26;
    compressor.knee.value = 16;
    compressor.ratio.value = 9;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.28;
    outputGain.gain.value = 0.72;
    volumeGain.gain.value = volume;
    audioContext.createMediaElementSource(audio).connect(inputGain);
    audioContext.createMediaElementSource(previewAudio).connect(inputGain);
    inputGain.connect(compressor).connect(outputGain).connect(volumeGain).connect(audioContext.destination);
  }

  async function playMain(): Promise<void> {
    setupAudioGraph();
    await audioContext?.resume();
    await audio.play().catch(() => {});
  }

  async function playPreview(): Promise<void> {
    setupAudioGraph();
    await audioContext?.resume();
    await previewAudio.play().catch(() => {});
  }

  function togglePlay(): void {
    if (!$player.current) return;
    if ($player.isPlaying) {
      setPlaying(false);
      audio.pause();
    } else {
      setPlaying(true);
      if (!$preview) void playMain();
    }
  }

  function seek(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    audio.currentTime = Number(target.value);
    elapsed = audio.currentTime;
    setPosition(elapsed);
  }

  function changeVolume(event: Event): void {
    volume = Number((event.currentTarget as HTMLInputElement).value);
    if (volumeGain) volumeGain.gain.value = volume;
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      // Volume still works when storage is unavailable.
    }
  }

  function readSavedVolume(): number {
    try {
      const saved = localStorage.getItem(VOLUME_KEY);
      if (saved === null) return DEFAULT_VOLUME;
      const value = Number(saved);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULT_VOLUME;
    } catch {
      return DEFAULT_VOLUME;
    }
  }

  async function revealSongFolder(): Promise<void> {
    if (!$player.current) return;
    await fetch("/api/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: $player.current.folderId, kind: "folder" }),
    });
  }

  function syncTime(): void {
    elapsed = audio.currentTime;
    if (loadedId === $player.current?.id) setPosition(elapsed);
  }

  function restorePosition(): void {
    duration = audio.duration;
    if (pendingPosition > 0 && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(pendingPosition, Math.max(0, audio.duration - 0.05));
      elapsed = audio.currentTime;
    }
    pendingPosition = 0;
    if ($player.isPlaying && !$preview && audio.paused) void playMain();
  }

  $: if (audio && $player.current && $player.current.id !== loadedId) {
    loadedId = $player.current.id;
    pendingPosition = $player.position;
    audio.src = `/api/audio/${encodeURIComponent(loadedId)}`;
    audio.load();
    elapsed = 0;
    duration = 0;
    if ($player.isPlaying && !$preview && pendingPosition === 0) void playMain();
  }

  $: if (previewAudio) {
    if ($preview && $preview.id !== loadedPreviewId) {
      loadedPreviewId = $preview.id;
      audio.pause();
      previewAudio.src = `/api/audio/${encodeURIComponent(loadedPreviewId)}`;
      previewAudio.currentTime = 0;
      void playPreview();
    } else if (!$preview && loadedPreviewId) {
      previewAudio.pause();
      previewAudio.removeAttribute("src");
      previewAudio.load();
      loadedPreviewId = "";
      if ($player.isPlaying) void playMain();
    }
  }

  onMount(() => {
    volume = readSavedVolume();
    if (volumeGain) volumeGain.gain.value = volume;
    const resume = () => {
      if ($player.isPlaying && !$preview && audio.paused) void playMain();
      else void audioContext?.resume();
    };
    window.addEventListener("pointerdown", resume);
    return () => {
      window.removeEventListener("pointerdown", resume);
      void audioContext?.close();
    };
  });
</script>

{#if $player.playlistVisible && $player.queue.length}
  <section class="queue-panel" aria-label="Play queue">
    <div class="queue-head">
      <div><span>PLAY QUEUE</span><strong>{$player.queue.length} tracks</strong></div>
      <button type="button" on:click={togglePlaylist} aria-label="Close queue">×</button>
    </div>
    <div class="queue-list">
      {#each $player.queue as item, index (`${item.id}-${index}`)}
        <div class:current={index === $player.currentIndex} class="queue-row">
          <button type="button" class="queue-track" on:click={() => selectQueueIndex(index)}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.songName}</strong>
            <small>{item.filename}</small>
          </button>
          {#if index !== $player.currentIndex}
            <button class="queue-remove" type="button" aria-label={`Remove ${item.songName} from queue`} on:click={() => removeQueueItem(index)}>×</button>
          {/if}
        </div>
      {/each}
    </div>
  </section>
{/if}

<footer class:empty={!$player.current} class="player-dock">
  <audio bind:this={audio} preload="metadata" on:ended={() => moveQueue(1)} on:timeupdate={syncTime} on:loadedmetadata={restorePosition} on:durationchange={() => (duration = audio.duration)}></audio>
  <audio bind:this={previewAudio} preload="metadata"></audio>

  <div class="now-playing">
    {#if $player.current}
      <div class="album-mark" class:active={$player.isPlaying && !$preview} aria-hidden="true"><i></i><i></i><i></i></div>
      <button type="button" class="now-playing-copy" on:click={() => onlocate($player.current!.folderId)} title="Find this song in the list">
        <strong>{$player.current.songName}</strong>
        <span>{$player.current.filename}</span>
        <time datetime={new Date($player.current.songDate).toISOString()}>{formatDate($player.current.songDate)}</time>
      </button>
    {/if}
  </div>

  <div class="transport">
    <div class="transport-buttons">
      <button type="button" disabled={$player.currentIndex <= 0} on:click={() => moveQueue(-1)} aria-label="Previous track"><svg class="icon-skip" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2.5v11M13 3 7.5 8l5.5 5" /></svg></button>
      <button class="play-button" type="button" disabled={!$player.current} on:click={togglePlay} aria-label={$player.isPlaying ? "Pause" : "Play"}>
        {#if $player.isPlaying}<svg class="icon-pause" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="4" height="12" rx=".7" /><rect x="9" y="2" width="4" height="12" rx=".7" /></svg>{:else}<svg class="icon-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.2v11.6L14 8z" /></svg>{/if}
      </button>
      <button type="button" disabled={$player.currentIndex < 0 || $player.currentIndex >= $player.queue.length - 1} on:click={() => moveQueue(1)} aria-label="Next track"><svg class="icon-skip" viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2.5v11M3 3l5.5 5L3 13" /></svg></button>
      <button class="finder-button" type="button" disabled={!$player.current} on:click={revealSongFolder} title="Open song folder in Finder"><svg class="icon-folder" viewBox="0 0 18 18" aria-hidden="true"><path d="M1.8 14.2V4h5l1.7 2h7.7v8.2z" /></svg><span>OPEN IN FINDER</span></button>
    </div>
    <div class="timeline"><span>{formatTime(elapsed)}</span><input aria-label="Seek" type="range" min="0" max={duration || 0} step="0.1" value={elapsed} on:input={seek} /><span>{formatTime(duration)}</span></div>
  </div>

  <div class="player-tools">
    <button class="queue-button" class:active={$player.playlistVisible} type="button" disabled={!$player.queue.length} on:click={togglePlaylist} aria-label="Show play queue"><svg class="icon-queue" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4h13M1.5 8h13M1.5 12h13" /></svg><span>{$player.queue.length || ""}</span></button>
    <label class="volume-control"><svg class="icon-volume" viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 8h3.2L10 4.5v11l-4.3-3.5H2.5z" /><path d="M13 7a4 4 0 0 1 0 6M15.6 4.7a7.1 7.1 0 0 1 0 10.6" /></svg><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} on:input={changeVolume} /></label>
  </div>
</footer>
