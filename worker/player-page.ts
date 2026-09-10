import { defaultTheme, themeCSS, type PlayerTheme } from "./player-theme";
import { escapeHtml, type SharedSong } from "./index";

function dateMarkup(value?: number): string {
  if (value === undefined) return '<span class="date">Date unavailable</span>';
  const date = new Date(value);
  return `<time class="date" datetime="${date.toISOString()}">${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>`;
}

export function playerPage(song: SharedSong, id: string, selected: number, theme: PlayerTheme = defaultTheme): string {
  const older = song.versions.map((version, index) => `<a href="/${id}?version=${index}" ${index === selected ? 'aria-current="true"' : ''}><span>${escapeHtml(version.label)}${index === selected ? " (selected)" : ""}</span>${dateMarkup(version.modifiedAt)}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(song.title)}</title><link rel="stylesheet" href="/waveform.css"><style>
${themeCSS(theme)}
@font-face{font-family:"Roboto Mono";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/roboto-mono-latin-400-normal.woff2") format("woff2")}
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:clamp(8px,4vw,var(--pagePadding));background:var(--background);background-image:var(--pageGradient);color:var(--text);font-family:var(--font)}main{width:min(100%,var(--cardWidth));min-width:0;min-height:var(--cardHeight);display:flex;flex-direction:column;background:linear-gradient(var(--card),var(--card)) padding-box,var(--rimGradient) border-box;border:var(--borderWidth) solid transparent;border-radius:var(--radius);box-shadow:0 24px 80px rgb(var(--shadowRGB) / calc(var(--shadow) / 100));overflow:hidden}.song{padding:clamp(16px,6vw,var(--songPadding));flex:1}p{font-size:var(--eyebrowSize);letter-spacing:calc(var(--eyebrowSpacing) * 1em);color:var(--muted);margin:0 0 16px}h1{font-size:clamp(20px,6vw,var(--titleSize));line-height:1.2;overflow-wrap:anywhere;margin:0 0 14px;font-weight:var(--titleWeight)}.version{font-size:var(--bodySize);overflow-wrap:anywhere;color:var(--muted)}.date{font-size:12px;color:var(--muted)}.latest-date{margin-top:16px;font-size:12px;color:var(--muted)}details{margin-top:var(--versionSpacing)}summary{cursor:pointer;font-size:14px}nav{display:grid;gap:6px;margin-top:12px;max-height:240px;overflow:auto}a{display:flex;flex-direction:column;gap:5px;color:var(--accent);text-decoration:none;padding:10px;border-radius:8px;font-size:14px;overflow-wrap:anywhere}a:hover,a[aria-current]{background:var(--accentSoft)}footer{padding:clamp(12px,4vw,var(--footerPadding));border-top:var(--borderWidth) solid var(--border);background:var(--footer);background-image:var(--footerGradient)}.controls{display:flex;align-items:center;justify-content:center;position:relative;margin-bottom:var(--controlGap)}button{display:grid;place-items:center;padding:0;border:0;cursor:pointer}button:focus-visible,input:focus-visible,summary:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:4px}#play{width:var(--playSize);height:var(--playSize);border-radius:50%;background:var(--play);background-image:var(--playGradient);color:var(--playIcon)}#play:hover{background:var(--accent)}svg{width:20px;height:20px;display:block}.volume{position:absolute;right:0;display:flex;align-items:center;gap:8px;color:var(--muted)}.volume input{width:76px}.volume svg{fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round}.timeline{display:grid;grid-template-columns:max-content minmax(0,1fr) max-content;gap:var(--timelineGap);align-items:center;font:500 var(--timeSize) var(--timeFont);color:var(--time)}.timeline span{min-width:4ch}.timeline span:last-child{text-align:right}.waveform{height:var(--waveHeight)}.waveform input:focus-visible{outline:none}input{min-width:0;accent-color:var(--accent);cursor:pointer}#error{margin:14px 0 0;letter-spacing:0;color:var(--error)}audio{width:100%}[hidden]{display:none!important}@media(max-width:420px){.volume input{width:44px}.volume{gap:3px}}

</style><script src="/player.js" type="module"></script></head><body><main><div class="song"><p class="eyebrow">${escapeHtml(theme.eyebrow)}</p><h1>${escapeHtml(song.title)}</h1><div class="version">${escapeHtml(song.versions[selected].label)}</div><div class="latest-date">Latest version · ${dateMarkup(song.versions[song.latest].modifiedAt)}${selected !== song.latest ? `<br>Selected version · ${dateMarkup(song.versions[selected].modifiedAt)}` : ""}</div>${song.versions.length > 1 ? `<details><summary>Explore all ${song.versions.length} versions</summary><nav aria-label="Song versions">${older}</nav></details>` : ""}</div><footer aria-label="Song player"><audio controls preload="metadata" src="/${id}/audio/${selected}">Your browser does not support audio playback.</audio><div id="custom-controls" hidden><div class="controls"><button id="play" type="button" aria-label="Play"><svg viewBox="0 0 16 16" aria-hidden="true"><path id="play-icon" fill="currentColor" d="M4 2.2v11.6L14 8z" /></svg></button><label class="volume"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 8h3.2L10 4.5v11l-4.3-3.5H2.5zM13 7a4 4 0 0 1 0 6M15.6 4.7a7.1 7.1 0 0 1 0 10.6" /></svg><input id="volume" aria-label="Volume" type="range" min="0" max="1" step="0.01" value="0.72"></label></div><div class="timeline"><span id="elapsed">0:00</span><input id="seek" aria-label="Seek" type="range" min="0" max="0" step="0.1" value="0" disabled><span id="duration">0:00</span></div></div><p id="error" role="alert" hidden></p></footer></main></body></html>`;
}

// Static script: song titles and filenames are never interpolated into executable code.
export const playerScript = `
import { mountWaveform } from "/waveform.js";
const audio = document.querySelector('audio');
const play = document.getElementById('play');
const seek = document.getElementById('seek');
const volume = document.getElementById('volume');
const error = document.getElementById('error');
const format = value => { const n = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); };
function sync() {
  play.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  document.getElementById('play-icon').setAttribute('d', audio.paused ? 'M4 2.2v11.6L14 8z' : 'M3 2h4v12H3zM9 2h4v12H9z');
  document.getElementById('elapsed').textContent = format(audio.currentTime);
  document.getElementById('duration').textContent = format(audio.duration);
  seek.disabled = !Number.isFinite(audio.duration) || audio.duration <= 0;
  seek.max = seek.disabled ? 0 : audio.duration;
  seek.value = audio.currentTime;
}
async function toggle() {
  if (!audio.paused) { audio.pause(); return; }
  error.hidden = true;
  try { await audio.play(); } catch { error.textContent = 'Could not play this audio. Try again.'; error.hidden = false; }
}
play.addEventListener('click', toggle);
seek.addEventListener('input', () => { audio.currentTime = Number(seek.value); sync(); });
volume.addEventListener('input', () => { audio.volume = Number(volume.value); try { localStorage.setItem('shared-player-volume', volume.value); } catch {} });
try { const saved = localStorage.getItem('shared-player-volume'); if (saved !== null && Number.isFinite(Number(saved))) volume.value = Math.max(0, Math.min(1, Number(saved))); } catch {}
audio.volume = Number(volume.value);
for (const event of ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'durationchange']) audio.addEventListener(event, sync);
audio.addEventListener('error', () => { error.textContent = 'This audio could not be loaded. Refresh to try again.'; error.hidden = false; sync(); });
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  event.preventDefault(); toggle();
}, { capture: true });
audio.controls = false;
audio.hidden = true;
document.getElementById('custom-controls').hidden = false;
sync();
mountWaveform(seek, audio);
`;
