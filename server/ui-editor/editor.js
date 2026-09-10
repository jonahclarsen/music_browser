const $ = id => document.getElementById(id);
const frame = $('preview');
const storageKey = 'music-browser-worker-theme-v1';
let config, theme, css = '', history = [], future = [], timer, sequence = 0, audioURL;
const status = text => { $('status').textContent = text; };
const clone = value => structuredClone(value);
const fontLabels = { avenir: 'Avenir Next', system: 'System sans', helvetica: 'Helvetica', georgia: 'Georgia', mono: 'Roboto Mono' };
const typeKeys = new Set(['titleSize', 'titleWeight', 'bodySize', 'timeSize', 'eyebrowSize', 'eyebrowSpacing']);
function paint() {
  const doc = frame.contentDocument;
  if (!doc?.querySelector('.song')) return;
  let style = doc.getElementById('editor-theme');
  if (!style) { style = doc.createElement('style'); style.id = 'editor-theme'; doc.head.append(style); }
  style.textContent = css;
  const mode = $('appearance').value;
  if (mode === 'system') delete doc.documentElement.dataset.theme;
  else doc.documentElement.dataset.theme = mode;
  doc.querySelector('.eyebrow').textContent = theme.eyebrow;
  doc.querySelector('h1').textContent = $('sample-title').value;
}
function historyButtons() { $('undo').disabled = !history.length; $('redo').disabled = !future.length; }
async function validate(value) {
  const response = await fetch('/ui-editor/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not preview this theme.');
  return result;
}
async function update(value, remember = true) {
  const request = ++sequence;
  try {
    const result = await validate(value);
    if (request !== sequence) return;
    if (remember && JSON.stringify(theme) !== JSON.stringify(result.theme)) { history.push(clone(theme)); if (history.length > 80) history.shift(); future = []; }
    theme = result.theme; css = result.css;
    paint(); historyButtons();
    try { localStorage.setItem(storageKey, JSON.stringify(theme)); status('Draft saved in this browser.'); }
    catch { status('Preview updated. Browser storage is unavailable; export to keep your theme.'); }
  } catch (error) { if (request === sequence) status(error.message); }
}
function values() {
  const draft = clone(theme);
  for (const field of document.querySelectorAll('[data-key]')) {
    const keys = field.dataset.key.split('.');
    const target = keys.length === 2 ? draft[keys[0]] : draft;
    target[keys.at(-1)] = field.type === 'checkbox' ? field.checked : field.type === 'range' ? Number(field.value) : field.value;
  }
  return draft;
}
function changed() { clearTimeout(timer); timer = setTimeout(() => update(values()), 80); }
function colors() {
  const mode = $('palette-mode').value;
  $('colors').replaceChildren();
  for (const [key, label] of Object.entries(config.colorControls)) {
    const row = document.createElement('div'); row.className = 'color-field';
    const text = document.createElement('label'); text.textContent = label; text.htmlFor = `color-${key}`;
    const picker = document.createElement('input'); picker.type = 'color'; picker.id = `color-${key}`; picker.value = theme[mode][key]; picker.dataset.key = `${mode}.${key}`;
    const hex = document.createElement('input'); hex.type = 'text'; hex.value = picker.value; hex.maxLength = 7; hex.setAttribute('aria-label', `${label} hex color`);
    picker.addEventListener('input', () => { hex.value = picker.value; changed(); });
    hex.addEventListener('input', () => { if (/^#[\da-f]{6}$/i.test(hex.value)) { picker.value = hex.value; changed(); } });
    row.append(text, picker, hex); $('colors').append(row);
  }
}
function render() {
  colors(); $('layout').replaceChildren(); $('type').replaceChildren(); $('content').replaceChildren();
  for (const [key, [name, min, max, step]] of Object.entries(config.layoutControls)) {
    const label = document.createElement('label'); label.className = 'field';
    const head = document.createElement('span'); head.className = 'field-head';
    const text = document.createElement('span'); text.textContent = name;
    const output = document.createElement('output'); output.textContent = theme.layout[key];
    const input = document.createElement('input'); input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = theme.layout[key]; input.dataset.key = `layout.${key}`;
    input.addEventListener('input', () => { output.textContent = input.value; changed(); });
    head.append(text, output); label.append(head, input); $(typeKeys.has(key) ? 'type' : 'layout').append(label);
  }
  for (const [key, text] of [['font', 'Song font'], ['timeFont', 'Timestamp font']]) {
    const label = document.createElement('label'); label.className = 'field'; label.textContent = text;
    const select = document.createElement('select'); select.dataset.key = key;
    for (const font of config.fonts) { const option = document.createElement('option'); option.value = font; option.textContent = fontLabels[font]; select.append(option); }
    select.value = theme[key]; select.addEventListener('change', changed); label.append(select); $('type').prepend(label);
  }
  const label = document.createElement('label'); label.className = 'field'; label.textContent = 'Intro text';
  const input = document.createElement('input'); input.type = 'text'; input.maxLength = 100; input.value = theme.eyebrow; input.dataset.key = 'eyebrow'; input.addEventListener('input', changed); label.append(input); $('content').append(label);
  for (const [key, text] of [['showEyebrow', 'Show intro'], ['showVersion', 'Show filename'], ['showDates', 'Show dates'], ['showVolume', 'Show volume']]) {
    const label = document.createElement('label'); label.className = 'toggle'; label.textContent = text;
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = theme[key]; input.dataset.key = key; input.addEventListener('change', changed); label.append(input); $('content').append(label);
  }
  historyButtons();
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function flush() { clearTimeout(timer); await update(values()); }
$('palette-mode').addEventListener('change', async () => {
  await flush(); colors(); $('appearance').value = $('palette-mode').value; paint();
});
$('appearance').addEventListener('change', async () => {
  await flush();
  $('palette-mode').value = $('appearance').value === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : $('appearance').value;
  colors(); paint();
});
$('viewport').addEventListener('change', () => { frame.style.width = $('viewport').value; frame.style.maxWidth = '100%'; });
new ResizeObserver(() => { $('dimensions').textContent = Math.round(frame.clientWidth) + ' × ' + Math.round(frame.clientHeight); }).observe(frame);
$('sample-title').addEventListener('input', paint);
$('sample-audio').addEventListener('change', event => {
  const file = event.target.files[0]; if (!file) return;
  if (audioURL) URL.revokeObjectURL(audioURL); audioURL = URL.createObjectURL(file);
  const audio = frame.contentDocument.querySelector('audio'); audio.src = audioURL; audio.load();
  frame.contentDocument.querySelector('.version').textContent = file.name;
  status('Previewing local audio. Nothing was uploaded.');
});
$('reset').addEventListener('click', async () => { clearTimeout(timer); await update(clone(config.theme)); render(); });
$('undo').addEventListener('click', async () => {
  await flush(); if (!history.length) return; const previous = history.pop(); future.push(clone(theme)); await update(previous, false); render();
});
$('redo').addEventListener('click', async () => {
  await flush(); if (!future.length) return; const next = future.pop(); history.push(clone(theme)); await update(next, false); render();
});
$('export').addEventListener('click', async () => { await flush(); download('player-theme.json', JSON.stringify(theme, null, 2) + '\n', 'application/json'); status('Theme exported. Share this file to apply your design to the live player.'); });
$('copy-css').addEventListener('click', async () => {
  await flush(); try { await navigator.clipboard.writeText(css); status('Theme CSS copied. Export the theme too to preserve your intro text.'); }
  catch { download('player-theme.css', css, 'text/css'); status('Clipboard unavailable; CSS downloaded.'); }
});
$('import-button').addEventListener('click', () => $('import').click());
$('import').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 32768) throw new Error('Theme file is too large.'); const result = await validate(JSON.parse(await file.text())); await update(result.theme); render(); }
  catch (error) { status(error.message); }
  event.target.value = '';
});
function previewReady() {
  if (theme) paint();
  const nav = frame.contentDocument?.querySelector('nav');
  if (nav && !nav.dataset.editor) {
    nav.dataset.editor = 'true';
    nav.addEventListener('click', event => {
      const link = event.target.closest('a'); if (!link) return;
      event.preventDefault();
      nav.querySelectorAll('a').forEach(a => a.removeAttribute('aria-current'));
      link.setAttribute('aria-current', 'true');
      frame.contentDocument.querySelector('.version').textContent = link.querySelector('span').textContent.replace(' (selected)', '');
    });
  }
}
frame.addEventListener('load', previewReady);
try {
  const response = await fetch('/ui-editor/config'); if (!response.ok) throw new Error('Could not load editor settings.'); config = await response.json(); theme = clone(config.theme);
  let draft; try { draft = JSON.parse(localStorage.getItem(storageKey)); } catch {}
  if (draft) { try { theme = (await validate(draft)).theme; } catch { status('The saved draft is invalid; using the current player theme.'); } }
  $('palette-mode').value = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  await update(theme, false); render(); previewReady();
} catch (error) { status(error.message); }
