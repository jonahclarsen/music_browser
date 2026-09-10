<script lang="ts">
  import type { PlayerTrack } from "../lib/types";

  export let x: number;
  export let y: number;
  export let track: PlayerTrack;
  export let folderId: string | undefined = undefined;
  export let showQueueActions = true;
  export let onclose: () => void;
  export let onnext: (track: PlayerTrack) => void;
  export let onlater: (track: PlayerTrack) => void;
  export let onshare: (track: PlayerTrack) => void;
  export let sharing = false;
  export let onerror: (message: string) => void;

  $: left = Math.max(8, Math.min(x, window.innerWidth - 214));
  $: top = Math.max(8, Math.min(y, window.innerHeight - (showQueueActions ? 152 : 88)));

  async function reveal(): Promise<void> {
    const response = await fetch("/api/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: folderId ?? track.id, kind: folderId ? "folder" : "file" }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      onerror(body.error ?? "Could not reveal that item.");
    }
    onclose();
  }
</script>

<svelte:window on:click={onclose} on:blur={onclose} on:keydown={(event) => event.key === "Escape" && onclose()} />

<div class="context-menu" role="menu" tabindex="-1" style:left="{left}px" style:top="{top}px">
  <button type="button" role="menuitem" disabled={sharing} on:click={() => (onshare(track), onclose())}>{sharing ? "Uploading…" : "Share song"}</button>
  <button type="button" role="menuitem" on:click={reveal}>Open in Finder</button>
  {#if showQueueActions}
    <button type="button" role="menuitem" on:click={() => (onnext(track), onclose())}>Play Next</button>
    <button type="button" role="menuitem" on:click={() => (onlater(track), onclose())}>Play Later</button>
  {/if}
</div>
