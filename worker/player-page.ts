import { escapeHtml, type SharedSong } from "./index";

function dateMarkup(value?: number): string {
  if (value === undefined) return '<span class="date">Date unavailable</span>';
  const date = new Date(value);
  return `<time class="date" datetime="${date.toISOString()}">${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>`;
}

export function playerPage(song: SharedSong, id: string, selected: number): string {
  const older = song.versions.map((version, index) => `<a href="/${id}?version=${index}" ${index === selected ? 'aria-current="true"' : ''}><span>${escapeHtml(version.label)}${index === selected ? " (selected)" : ""}</span>${dateMarkup(version.modifiedAt)}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(song.title)}</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:#e8edf4;color:#13202f;font-family:"Avenir Next",system-ui,sans-serif}main{width:min(100%,600px);min-height:420px;display:flex;flex-direction:column;background:#f5f8fc;border:1px solid #fff;border-radius:24px;box-shadow:0 24px 80px #24334112;overflow:hidden}.song{padding:clamp(24px,6vw,48px);flex:1}p{font-size:11px;letter-spacing:.16em;color:#6b7b8f;margin:0 0 16px}h1{font-size:clamp(26px,6vw,38px);line-height:1.2;overflow-wrap:anywhere;margin:0 0 14px;font-weight:600}.version{font-size:13px;overflow-wrap:anywhere;color:#6b7b8f}.date{font-size:12px;color:#6b7b8f}.latest-date{margin-top:16px;font-size:12px;color:#6b7b8f}details{margin-top:28px}summary{cursor:pointer;font-size:14px}nav{display:grid;gap:6px;margin-top:12px;max-height:240px;overflow:auto}a{display:flex;flex-direction:column;gap:5px;color:#2f6df6;text-decoration:none;padding:10px;border-radius:8px;font-size:14px;overflow-wrap:anywhere}a:hover,a[aria-current]{background:#dbe6ff}footer{padding:20px 28px 24px;border-top:1px solid #d2dbe6;background:#f8fafd}.controls{display:flex;align-items:center;justify-content:center;position:relative;margin-bottom:16px}button{display:grid;place-items:center;padding:0;border:0;cursor:pointer}button:focus-visible,input:focus-visible,summary:focus-visible,a:focus-visible{outline:2px solid #2f6df6;outline-offset:4px}#play{width:48px;height:48px;border-radius:50%;background:#13202f;color:white}#play:hover{background:#2f6df6}svg{width:20px;height:20px;display:block}.volume{position:absolute;right:0;display:flex;align-items:center;gap:8px;color:#6b7b8f}.volume input{width:76px}.volume svg{fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round}.timeline{display:grid;grid-template-columns:38px 1fr 38px;gap:10px;align-items:center;font:11px monospace;color:#8090a4}.timeline span:last-child{text-align:right}input{min-width:0;accent-color:#2f6df6;cursor:pointer}#error{margin:14px 0 0;letter-spacing:0;color:#d9433b}audio{width:100%}[hidden]{display:none!important}@media(max-width:420px){body{padding:16px}footer{padding:20px}.volume input{width:52px}.volume{gap:3px}}
</style><script src="/player.js" defer></script></head><body><main><div class="song"><p>JONAH SHARED WITH YOU</p><h1>${escapeHtml(song.title)}</h1><div class="version">${escapeHtml(song.versions[selected].label)}</div><div class="latest-date">Latest version · ${dateMarkup(song.versions[song.latest].modifiedAt)}${selected !== song.latest ? `<br>Selected version · ${dateMarkup(song.versions[selected].modifiedAt)}` : ""}</div>${song.versions.length > 1 ? `<details><summary>Explore all ${song.versions.length} versions</summary><nav aria-label="Song versions">${older}</nav></details>` : ""}</div><footer aria-label="Song player"><audio controls preload="metadata" src="/${id}/audio/${selected}">Your browser does not support audio playback.</audio><div id="custom-controls" hidden><div class="controls"><button id="play" type="button" aria-label="Play"><svg viewBox="0 0 16 16" aria-hidden="true"><path id="play-icon" fill="currentColor" d="M4 2.2v11.6L14 8z" /></svg></button><label class="volume"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 8h3.2L10 4.5v11l-4.3-3.5H2.5zM13 7a4 4 0 0 1 0 6M15.6 4.7a7.1 7.1 0 0 1 0 10.6" /></svg><input id="volume" aria-label="Volume" type="range" min="0" max="1" step="0.01" value="0.72"></label></div><div class="timeline"><span id="elapsed">0:00</span><input id="seek" aria-label="Seek" type="range" min="0" max="0" step="0.1" value="0" disabled><span id="duration">0:00</span></div></div><p id="error" role="alert" hidden></p></footer></main></body></html>`;
}

// Static script: song titles and filenames are never interpolated into executable code.
export const playerScript = `
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
  if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('button, input, summary, a')) return;
  event.preventDefault(); toggle();
});
audio.controls = false;
audio.hidden = true;
document.getElementById('custom-controls').hidden = false;
sync();
`;
