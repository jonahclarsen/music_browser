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

interface RecentPosition {
  position: number;
  leftAt: number;
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
export const preview = writable<PlayerTrack | null>(null);

const recentPositions = new Map<string, RecentPosition>();
const RETURN_WINDOW_MS = 10_000;

function rememberCurrent(state: PlayerState): void {
  if (!state.current) return;
  recentPositions.set(state.current.id, { position: state.position, leftAt: Date.now() });
}

function restoredPosition(track: PlayerTrack): number {
  const recent = recentPositions.get(track.id);
  if (!recent) return 0;
  recentPositions.delete(track.id);
  return Date.now() - recent.leftAt <= RETURN_WINDOW_MS ? recent.position : 0;
}

export function makeTrack(song: Song, version: SongVersion = song.latest): PlayerTrack {
  return { ...version, songName: song.name, parentFolder: song.parentFolder, folderId: song.folderId, songDate: song.date };
}

export function playNow(track: PlayerTrack): void {
  player.update((state) => {
    rememberCurrent(state);
    return { queue: [track], currentIndex: 0, current: track, isPlaying: true, playlistVisible: false, position: restoredPosition(track) };
  });
}

export function playQueue(queue: PlayerTrack[]): void {
  player.update((state) => {
    rememberCurrent(state);
    const current = queue[0] ?? null;
    return { queue, currentIndex: queue.length ? 0 : -1, current, isPlaying: queue.length > 0, playlistVisible: false, position: current ? restoredPosition(current) : 0 };
  });
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
    if (!current) return state;
    rememberCurrent(state);
    return { ...state, current, currentIndex: index, isPlaying: true, position: restoredPosition(current) };
  });
}

export function moveQueue(direction: 1 | -1): void {
  player.update((state) => {
    const index = state.currentIndex + direction;
    const current = state.queue[index];
    if (!current) return { ...state, isPlaying: false };
    rememberCurrent(state);
    return { ...state, current, currentIndex: index, isPlaying: true, position: restoredPosition(current) };
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

export function startPreview(track: PlayerTrack): void {
  preview.set(track);
}

export function stopPreview(): void {
  preview.set(null);
}
