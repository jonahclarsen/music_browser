export interface ParentFolder {
  name: string;
}

export interface SongVersion {
  id: string;
  filename: string;
  version: string;
  major: number;
  minor: number;
  modifiedAt: number;
  format: "mp3" | "wav";
}

export interface Song {
  id: string;
  name: string;
  parentFolder: string;
  folderId: string;
  date: number;
  latest: SongVersion;
  versions: SongVersion[];
}

export interface LibraryResult {
  directory: string;
  songs: Song[];
  scannedProjectCount: number;
}

export interface PlayerTrack extends SongVersion {
  songName: string;
  parentFolder: string;
  folderId: string;
  songDate: number;
}
