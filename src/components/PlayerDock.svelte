<script lang="ts">
  import { onMount } from "svelte";
  import { moveQueue, player, removeQueueItem, selectQueueIndex, setPlaying, setPosition, togglePlaylist } from "../lib/player";

  const VOLUME_KEY = "music-browser-volume";
  const DEFAULT_VOLUME = 0.72;

  let audio: HTMLAudioElement;
  let audioContext: AudioContext | null = null;
  let volumeGain: GainNode | null = null;
  let loadedId = "";
  let volume = DEFAULT_VOLUME;
  let elapsed = 0;
  let duration = 0;
  let pendingPosition = 0;

  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds)) return "0:00";
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }

  function setupAudioGraph(): void {
    if (audioContext || !audio) return;
    audioContext = new AudioContext();
    const source = audioContext.createMediaElementSource(audio);
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
    source.connect(inputGain).connect(compressor).connect(outputGain).connect(volumeGain).connect(audioContext.destination);
  }

  async function ensurePlaying(): Promise<void> {
    setupAudioGraph();
    await audioContext?.resume();
    await audio.play().catch(() => {});
  }

  function togglePlay(): void {
    if (!$player.current) return;
    if (audio.paused) void ensurePlaying();
    else audio.pause();
  }

  function seek(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    audio.currentTime = Number(target.value);
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
      pendingPosition = 0;
    }
  }

  $: if (audio && $player.current && $player.current.id !== loadedId) {
    const shouldPlay = $player.isPlaying;
    loadedId = $player.current.id;
    pendingPosition = $player.position;
    audio.src = `/api/audio/${encodeURIComponent(loadedId)}`;
    audio.load();
    elapsed = 0;
    duration = 0;
    if (shouldPlay) void ensurePlaying();
  }

  $: if (audio && loadedId && $player.isPlaying && audio.paused) void ensurePlaying();

  onMount(() => {
    volume = readSavedVolume();
    if (volumeGain) volumeGain.gain.value = volume;
    const resume = () => {
      if ($player.isPlaying && audio.paused) void ensurePlaying();
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
  <audio
    bind:this={audio}
    preload="metadata"
    on:play={() => setPlaying(true)}
    on:pause={() => setPlaying(false)}
    on:ended={() => moveQueue(1)}
    on:timeupdate={syncTime}
    on:loadedmetadata={restorePosition}
    on:durationchange={() => (duration = audio.duration)}
  ></audio>

  <div class="now-playing">
    {#if $player.current}
      <div class="album-mark" class:active={$player.isPlaying} aria-hidden="true"><i></i><i></i><i></i></div>
      <div>
        <strong>{$player.current.songName}</strong>
        <span>{$player.current.filename}</span>
      </div>
    {/if}
  </div>

  <div class="transport">
    <div class="transport-buttons">
      <button type="button" disabled={$player.currentIndex <= 0} on:click={() => moveQueue(-1)} aria-label="Previous track">
        <svg class="icon-skip" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.75 1.75 3.5 6l4.25 4.25" /></svg>
      </button>
      <button class="play-button" type="button" disabled={!$player.current} on:click={togglePlay} aria-label={$player.isPlaying ? "Pause" : "Play"}>
        {#if $player.isPlaying}
          <svg class="icon-pause" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9" /><rect x="7" y="1.5" width="3" height="9" /></svg>
        {:else}
          <svg class="icon-play" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9L10.5 6z" /></svg>
        {/if}
      </button>
      <button type="button" disabled={$player.currentIndex < 0 || $player.currentIndex >= $player.queue.length - 1} on:click={() => moveQueue(1)} aria-label="Next track">
        <svg class="icon-skip" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.25 1.75 8.5 6l-4.25 4.25" /></svg>
      </button>
    </div>
    <div class="timeline">
      <span>{formatTime(elapsed)}</span>
      <input aria-label="Seek" type="range" min="0" max={duration || 0} step="0.1" value={elapsed} on:input={seek} />
      <span>{formatTime(duration)}</span>
    </div>
  </div>

  <div class="player-tools">
    <button class="finder-button" type="button" disabled={!$player.current} on:click={revealSongFolder} title="Open song folder in Finder">
      <svg class="icon-folder" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.6 12.6V3.4h4.3l1.5 1.8h7v7.4z" /></svg>
      OPEN
    </button>
    <button class="queue-button" class:active={$player.playlistVisible} type="button" disabled={!$player.queue.length} on:click={togglePlaylist} aria-label="Show play queue">
      <svg class="icon-queue" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 3.5h12M1 7h12M1 10.5h12" /></svg>
      <span>{$player.queue.length || ""}</span>
    </button>
    <label class="volume-control">
      <svg class="icon-volume" viewBox="0 0 16 16" aria-hidden="true"><path class="speaker" d="M2 5.5h3L9 2.5v11L5 10.5H2z" /><path class="wave" d="M11.5 5.25a3.75 3.75 0 0 1 0 5.5" /></svg>
      <input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} on:input={changeVolume} />
    </label>
  </div>
</footer>
