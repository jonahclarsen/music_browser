<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { SharedLink, SharedLinksPage } from "../lib/sharing";
  export let oncopy: (url: string) => void;
  let shares: SharedLink[] = [];
  let cursor: string | undefined;
  let loading = false;
  let loaded = false;
  let error = "";
  let busyId = "";
  let deletingId = "";

  async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Could not update shared links.");
    return body;
  }
  async function load(more = false): Promise<void> {
    loading = true;
    error = "";
    try {
      const result = await api<SharedLinksPage>(`/api/shares${more && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      const merged = new Map((more ? shares : []).map(share => [share.id, share]));
      for (const share of result.shares) merged.set(share.id, share);
      shares = [...merged.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      cursor = result.cursor;
      loaded = true;
    } catch (cause) { error = cause instanceof Error ? cause.message : "Could not load shared links."; }
    finally { loading = false; }
  }
  async function remove(share: SharedLink): Promise<void> {
    busyId = share.id;
    error = "";
    try {
      await api(`/api/shares/${share.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" });
      shares = shares.filter(item => item.id !== share.id);
      deletingId = "";
    } catch (cause) { error = cause instanceof Error ? cause.message : "Could not delete this share. Try again."; }
    finally { busyId = ""; }
  }
  async function expire(share: SharedLink, event: Event): Promise<void> {
    const select = event.currentTarget as HTMLSelectElement;
    if (select.value === "current") return;
    const days = Number(select.value);
    const expiresAt = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
    busyId = share.id;
    error = "";
    try {
      await api(`/api/shares/${share.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresAt }) });
      shares = shares.map(item => item.id === share.id ? { ...item, expiresAt: expiresAt ?? undefined } : item);
    } catch (cause) { error = cause instanceof Error ? cause.message : "Could not change expiry."; }
    finally { await tick(); select.value = shares.find(item => item.id === share.id)?.expiresAt ? "current" : "0"; busyId = ""; }
  }
  const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  onMount(() => { void load(); });
</script>

<section class="shared-links" aria-label="Shared links">
  <header class="shared-links-header">
    <div><h1>Shared links</h1><p>Manage the songs you’ve shared.</p></div>
    <button type="button" disabled={loading || Boolean(busyId)} on:click={() => load()}>Refresh</button>
  </header>
  {#if error}<p class="shared-error" role="alert">{error}</p>{/if}
  {#if loading}<p role="status">Loading shared links</p>{/if}
  {#if loaded && !loading && !shares.length && !error}<p class="shared-empty">No shared songs yet. Use Share on a song to create a link.</p>{/if}
  <div class="shared-list">
    {#each shares as share (share.id)}
      <article class="shared-card" aria-label={share.title}>
        <div class="shared-copy">
          <h2><a href={share.url} target="_blank" rel="noreferrer">{share.title}</a></h2>
          <p><time datetime={share.createdAt}>{date(share.createdAt)}</time> <span>{size(share.bytes)}</span></p>
          <a class="shared-address" href={share.url} target="_blank" rel="noreferrer">{share.url}</a>
          <details><summary>{share.filenames.length} {share.filenames.length === 1 ? "version" : "versions"}</summary><ul>{#each share.filenames as filename}<li>{filename}</li>{/each}</ul></details>
          {#if share.expiresAt}<p class="shared-expiry">{Date.parse(share.expiresAt) <= Date.now() ? "Expired" : "Expires"} {date(share.expiresAt)}</p>{/if}
        </div>
        <div class="shared-actions">
          <button type="button" on:click={() => oncopy(share.url)}>Copy link</button>
          <label>Expiry<select aria-label={`Expiry for ${share.title}`} value={share.expiresAt ? "current" : "0"} disabled={Boolean(busyId)} on:change={(event) => expire(share, event)}>
            {#if share.expiresAt}<option value="current">{date(share.expiresAt)}</option>{/if}
            <option value="0">No expiry</option><option value="1">In 1 day</option><option value="7">In 7 days</option><option value="30">In 30 days</option>
          </select></label>
          {#if deletingId === share.id}
            <p>Delete this link and every uploaded version?</p>
            <button class="delete-share" type="button" disabled={Boolean(busyId)} on:click={() => remove(share)}>{busyId === share.id ? "Deleting" : "Delete permanently"}</button>
            <button type="button" disabled={Boolean(busyId)} on:click={() => (deletingId = "")}>Cancel</button>
          {:else}
            <button class="delete-share" type="button" disabled={Boolean(busyId)} on:click={() => (deletingId = share.id)}>Delete</button>
          {/if}
        </div>
      </article>
    {/each}
    {#if cursor}<button type="button" disabled={loading} on:click={() => load(true)}>Load more</button>{/if}
  </div>
</section>
