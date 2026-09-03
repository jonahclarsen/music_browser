import { writable } from "svelte/store";
import type { PlayerTrack, Song, SongVersion } from "./types";

interface PlayerState {
  queue: PlayerTrack[];
  currentIndex: number;
  current: PlayerTrack | null;
  isPlaying: boolean;
  playlistVisible: boolean;
}

const initial: PlayerState = {
  queue: [],
  currentIndex: -1,
  current: null,
  isPlaying: false,
  playlistVisible: false,
};

export const player = writable<PlayerState>(initial);

export function makeTrack(song: Song, version: SongVersion = song.latest): PlayerTrack {
  return { ...version, songName: song.name, parentFolder: song.parentFolder };
}

export function playNow(track: PlayerTrack): void {
  player.set({ queue: [track], currentIndex: 0, current: track, isPlaying: true, playlistVisible: false });
}

export function playQueue(queue: PlayerTrack[]): void {
  player.set({ queue, currentIndex: queue.length ? 0 : -1, current: queue[0] ?? null, isPlaying: queue.length > 0, playlistVisible: false });
}

export function playNext(track: PlayerTrack): void {
  player.update((state) => {
    if (!state.current) return { ...state, queue: [track], current: track, currentIndex: 0, isPlaying: true };
    const queue = [...state.queue];
    queue.splice(state.currentIndex + 1, 0, track);
    return { ...state, queue };
  });
}

export function playLater(track: PlayerTrack): void {
  player.update((state) => {
    if (!state.current) return { ...state, queue: [track], current: track, currentIndex: 0, isPlaying: true };
    return { ...state, queue: [...state.queue, track] };
  });
}

export function selectQueueIndex(index: number): void {
  player.update((state) => {
    const current = state.queue[index];
    return current ? { ...state, current, currentIndex: index, isPlaying: true } : state;
  });
}

export function moveQueue(direction: 1 | -1): void {
  player.update((state) => {
    const index = state.currentIndex + direction;
    const current = state.queue[index];
    return current ? { ...state, current, currentIndex: index, isPlaying: true } : { ...state, isPlaying: false };
  });
}

export function setPlaying(isPlaying: boolean): void {
  player.update((state) => ({ ...state, isPlaying }));
}

export function togglePlaylist(): void {
  player.update((state) => ({ ...state, playlistVisible: !state.playlistVisible }));
}

export function removeQueueItem(index: number): void {
  player.update((state) => {
    if (index === state.currentIndex) return state;
    const queue = state.queue.filter((_, itemIndex) => itemIndex !== index);
    const currentIndex = index < state.currentIndex ? state.currentIndex - 1 : state.currentIndex;
    return { ...state, queue, currentIndex };
  });
}

