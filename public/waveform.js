// Shared by the local app and the public player. Keep playback on the original audio.
/** @param {AudioBuffer} buffer @param {number} count */
export function audioPeaks(buffer, count = 180) {
  const peaks = Array(count).fill(0);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let bin = 0; bin < count; bin++) {
      const start = Math.floor(bin * samples.length / count);
      const end = Math.floor((bin + 1) * samples.length / count);
      for (let i = start; i < end; i++) peaks[bin] = Math.max(peaks[bin], Math.abs(samples[i]));
    }
  }
  return peaks.map(peak => Math.min(1, peak));
}

/** @param {HTMLInputElement} input @param {HTMLAudioElement} audio */
export function mountWaveform(input, audio) {
  const host = document.createElement('div');
  host.className = 'waveform';
  input.before(host);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 540 70');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  host.append(svg, input);
  /** @type {number[]} */
  let peaks = [];
  /** @type {number | null} */
  let preview = null;
  let dragging = false;
  let source = '';
  let disposed = false;
  let controller = new AbortController();
  /** @type {Map<string, number[]>} */
  const cache = new Map();
  const format = (/** @type {number} */ seconds) => {
    const n = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  };
  const draw = () => {
    const progress = audio.duration > 0 ? audio.currentTime / audio.duration : 0;
    const bars = peaks.length ? peaks : Array(180).fill(0);
    svg.innerHTML = bars.map((peak, i) => {
      const position = i / bars.length;
      const color = preview !== null && position >= Math.min(progress, preview) && position < Math.max(progress, preview)
        ? 'var(--wave-preview, #8090a4)' : position < progress ? 'var(--accent, #2f6df6)' : 'var(--line-strong, #b9c6d6)';
      const height = Math.max(1, peak * 32);
      return '<line x1="' + (i * 540 / bars.length + 1) + '" x2="' + (i * 540 / bars.length + 1) + '" y1="' + (35 - height) + '" y2="' + (35 + height) + '" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>';
    }).join('');
    input.setAttribute('aria-valuetext', format(audio.currentTime) + ' / ' + format(audio.duration));
    host.title = preview === null ? '' : format(preview * audio.duration);
  };
  const load = async () => {
    const url = audio.src || audio.currentSrc;
    if (url === source) return;
    source = url;
    controller.abort();
    controller = new AbortController();
    const signal = controller.signal;
    preview = null;
    dragging = false;
    peaks = cache.get(url) || [];
    host.dataset.state = peaks.length ? 'ready' : 'loading';
    draw();
    if (!url || cache.has(url)) return;
    host.dataset.state = 'loading';
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error('Audio unavailable');
      const bytes = await response.arrayBuffer();
      if (signal.aborted) return;
      // Lower decode sample rate keeps memory bounded for longer tracks.
      const context = new OfflineAudioContext(1, 1, 8000);
      const buffer = await context.decodeAudioData(bytes);
      if (disposed || signal.aborted) return;
      peaks = audioPeaks(buffer);
      cache.set(url, peaks);
      if (cache.size > 8) cache.delete(cache.keys().next().value || '');
      host.dataset.state = 'ready';
      draw();
    } catch {
      if (disposed || signal.aborted) return;
      host.dataset.state = 'unavailable';
      // The baseline remains seekable if fetching or decoding fails.
    }
  };
  const position = (/** @type {PointerEvent} */ event) => {
    const bounds = input.getBoundingClientRect();
    preview = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    draw();
  };
  const start = (/** @type {PointerEvent} */ event) => {
    if (event.button !== 0 || input.disabled) return;
    event.preventDefault();
    input.focus({ preventScroll: true });
    input.setPointerCapture(event.pointerId);
    dragging = true;
    position(event);
  };
  const move = (/** @type {PointerEvent} */ event) => { if (!input.disabled) position(event); };
  const finish = (/** @type {PointerEvent} */ event) => {
    if (!dragging) return;
    position(event);
    input.value = String((preview || 0) * audio.duration);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    dragging = false;
    input.releasePointerCapture(event.pointerId);
    preview = null;
    draw();
  };
  const cancel = () => { dragging = false; preview = null; draw(); };
  const leave = () => { if (!dragging) cancel(); };
  const lostCapture = () => { if (dragging) cancel(); };
  /** @type {[string, EventListener][]} */
  const pointers = [['pointerdown', /** @type {EventListener} */ (start)], ['pointermove', /** @type {EventListener} */ (move)], ['pointerup', /** @type {EventListener} */ (finish)], ['pointercancel', cancel], ['lostpointercapture', lostCapture], ['pointerleave', leave], ['blur', cancel]];
  for (const [event, handler] of pointers) input.addEventListener(event, handler);
  for (const event of ['timeupdate', 'durationchange', 'seeking']) audio.addEventListener(event, draw);
  audio.addEventListener('loadstart', load);
  void load();
  draw();
  return () => {
    disposed = true;
    controller.abort();
    for (const [event, handler] of pointers) input.removeEventListener(event, handler);
    for (const event of ['timeupdate', 'durationchange', 'seeking']) audio.removeEventListener(event, draw);
    audio.removeEventListener('loadstart', load);
    host.before(input);
    host.remove();
  };
}
