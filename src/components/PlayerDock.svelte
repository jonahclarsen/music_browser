<script lang="ts">
  import { onMount } from "svelte";
  import { moveQueue, player, removeQueueItem, selectQueueIndex, setPlaying, togglePlaylist } from "../lib/player";

  let audio: HTMLAudioElement;
  let audioContext: AudioContext | null = null;
  let volumeGain: GainNode | null = null;
  let loadedId = "";
  let volume = 0.72;
  let elapsed = 0;
  let duration = 0;

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
    await audio.play().catch(() => setPlaying(false));
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
  }

  $: if (audio && $player.current && $player.current.id !== loadedId) {
    loadedId = $player.current.id;
    audio.src = `/api/audio/${encodeURIComponent(loadedId)}`;
    audio.load();
    elapsed = 0;
    duration = 0;
    if ($player.isPlaying) void ensurePlaying();
  }

  $: if (audio && loadedId && $player.isPlaying && audio.paused) void ensurePlaying();

  onMount(() => {
    const resume = () => void audioContext?.resume();
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
    on:timeupdate={() => (elapsed = audio.currentTime)}
    on:durationchange={() => (duration = audio.duration)}
  ></audio>

  <div class="now-playing">
    <div class="album-mark" class:active={$player.isPlaying} aria-hidden="true"><i></i><i></i><i></i></div>
    <div>
      <strong>{$player.current?.songName ?? "Nothing playing"}</strong>
      <span>{$player.current?.filename ?? "Choose a song to begin"}</span>
    </div>
  </div>

  <div class="transport">
    <div class="transport-buttons">
      <button type="button" disabled={$player.currentIndex <= 0} on:click={() => moveQueue(-1)} aria-label="Previous track">‹</button>
      <button class="play-button" type="button" disabled={!$player.current} on:click={togglePlay} aria-label={$player.isPlaying ? "Pause" : "Play"}>
        {$player.isPlaying ? "Ⅱ" : "▶"}
      </button>
      <button type="button" disabled={$player.currentIndex < 0 || $player.currentIndex >= $player.queue.length - 1} on:click={() => moveQueue(1)} aria-label="Next track">›</button>
    </div>
    <div class="timeline">
      <span>{formatTime(elapsed)}</span>
      <input aria-label="Seek" type="range" min="0" max={duration || 0} step="0.1" value={elapsed} on:input={seek} />
      <span>{formatTime(duration)}</span>
    </div>
  </div>

  <div class="player-tools">
    <button class:active={$player.playlistVisible} type="button" disabled={!$player.queue.length} on:click={togglePlaylist} aria-label="Show play queue">
      ≡ <span>{$player.queue.length || ""}</span>
    </button>
    <label class="volume-control">
      <span aria-hidden="true">◖</span>
      <input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} on:input={changeVolume} />
    </label>
    <span class="normalized" title="Fast adaptive loudness normalization is active">NORM</span>
  </div>
</footer>

