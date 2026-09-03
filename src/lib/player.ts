import { writable } from "svelte/store";
import type { PlayerTrack, Song, SongVersion } from "./types";

export interface PlayerState {
  queue: PlayerTrack[];
  currentIndex: number;
  current: PlayerTrack | null;
  isPlaying: boolean;
  playlistVisible: boolean;
  position: number;
}

const initial: PlayerState = {
  queue: [],
  currentIndex: -1,
  current: null,
  isPlaying: false,
  playlistVisible: false,
  position: 0,
};

export const player = writable<PlayerState>(initial);

export function makeTrack(song: Song, version: SongVersion = song.latest): PlayerTrack {
  return { ...version, songName: song.name, parentFolder: song.parentFolder, folderId: song.folderId };
}

export function playNow(track: PlayerTrack): void {
  player.set({ queue: [track], currentIndex: 0, current: track, isPlaying: true, playlistVisible: false, position: 0 });
}

export function playQueue(queue: PlayerTrack[]): void {
  player.set({ queue, currentIndex: queue.length ? 0 : -1, current: queue[0] ?? null, isPlaying: queue.length > 0, playlistVisible: false, position: 0 });
}

export function playNext(track: PlayerTrack): void {
  player.update((state) => {
    if (!state.current) return { ...state, queue: [track], current: track, currentIndex: 0, isPlaying: true, position: 0 };
    const queue = [...state.queue];
    queue.splice(state.currentIndex + 1, 0, track);
    return { ...state, queue };
  });
}

export function playLater(track: PlayerTrack): void {
  player.update((state) => {
    if (!state.current) return { ...state, queue: [track], current: track, currentIndex: 0, isPlaying: true, position: 0 };
    return { ...state, queue: [...state.queue, track] };
  });
}

export function selectQueueIndex(index: number): void {
  player.update((state) => {
    const current = state.queue[index];
    return current ? { ...state, current, currentIndex: index, isPlaying: true, position: 0 } : state;
  });
}

export function moveQueue(direction: 1 | -1): void {
  player.update((state) => {
    const index = state.currentIndex + direction;
    const current = state.queue[index];
    return current ? { ...state, current, currentIndex: index, isPlaying: true, position: 0 } : { ...state, isPlaying: false };
  });
}

export function setPlaying(isPlaying: boolean): void {
  player.update((state) => ({ ...state, isPlaying }));
}

export function setPosition(position: number): void {
  player.update((state) => ({ ...state, position }));
}

export function restorePlayer(
  queue: PlayerTrack[],
  currentIndex: number,
  isPlaying: boolean,
  playlistVisible: boolean,
  position: number,
): void {
  const safeIndex = queue.length ? Math.max(0, Math.min(currentIndex, queue.length - 1)) : -1;
  player.set({
    queue,
    currentIndex: safeIndex,
    current: safeIndex >= 0 ? queue[safeIndex] : null,
    isPlaying: safeIndex >= 0 && isPlaying,
    playlistVisible: queue.length > 0 && playlistVisible,
    position: Math.max(0, position),
  });
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
