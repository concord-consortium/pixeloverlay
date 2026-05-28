(function () {
  if (window.__pixelOverlayInjected) return;
  window.__pixelOverlayInjected = true;

  const DEFAULT_OPACITY = 0.5;
  const MIN_WIDTH = 20;
  const SAVE_DEBOUNCE_MS = 300;
  const LINE_HIT = 9;
  const LINE_HIT_OFFSET = Math.floor(LINE_HIT / 2);
  const UNDO_MAX = 50;

  let overlay = null;
  let active = false;
  let currentDataUrl = null;
  let saveTimer = null;

  let lines = [];
  let linesHidden = false;
  let lineIdSeq = 0;
  let lineUndoStack = [];
  let lineRedoStack = [];
  const lineEls = new Map();

  function pageKey() {
    return 'overlay:' + location.origin + location.pathname;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, SAVE_DEBOUNCE_MS);
  }

  function doSave() {
    if (!active) return;
    const data = {};
    if (overlay && currentDataUrl) {
      const img = overlay.querySelector('.pixeloverlay-image');
      data.dataUrl = currentDataUrl;
      data.left = parseFloat(overlay.style.left) || 0;
      data.top = parseFloat(overlay.style.top) || 0;
      data.width = parseFloat(overlay.style.width) || 0;
      data.opacity = img ? parseFloat(img.style.opacity) || DEFAULT_OPACITY : DEFAULT_OPACITY;
      data.locked = overlay.classList.contains('pixeloverlay-locked');
      data.hidden = overlay.classList.contains('pixeloverlay-hidden');
    }
    if (lines.length > 0 || linesHidden) {
      data.lines = lines.map((l) => ({
        orientation: l.orientation,
        position: l.position,
        color: l.color,
        style: l.style,
      }));
      data.linesHidden = linesHidden;
    }
    if (Object.keys(data).length === 0) {
      chrome.storage.local.remove(pageKey());
    } else {
      chrome.storage.local.set({ [pageKey()]: data });
    }
  }

  function restoreFromStorage() {
    chrome.storage.local.get([pageKey()], (data) => {
      const state = data[pageKey()];
      if (!state) return;
      if (state.dataUrl && !overlay) {
        createOverlay(state.dataUrl, state);
      }
      if (Array.isArray(state.lines) && state.lines.length > 0 && lines.length === 0) {
        linesHidden = !!state.linesHidden;
        document.documentElement.classList.toggle('pixeloverlay-lines-hidden', linesHidden);
        state.lines.forEach((l) => {
          addLineSilent(l.orientation, l.color, l.style, l.position, { focus: false });
        });
      }
    });
  }

  chrome.storage.local.get(['active'], (data) => {
    active = !!data.active;
    if (active) restoreFromStorage();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'setActive') {
      const wasActive = active;
      active = !!msg.active;
      if (!active) {
        removeOverlay({ clearStorage: false });
        clearLinesFromDom();
      } else if (!wasActive) {
        restoreFromStorage();
      }
      sendResponse({ ok: true });
    } else if (msg.type === 'showImage') {
      createOverlay(msg.dataUrl);
      sendResponse({ ok: true });
    } else if (msg.type === 'clearOverlay') {
      removeOverlay({ clearStorage: true });
      sendResponse({ ok: true });
    } else if (msg.type === 'addLine') {
      addLine(msg.orientation, msg.color || '#ff0000', msg.style || 'dashed');
      sendResponse({ ok: true });
    } else if (msg.type === 'removeAllLines') {
      removeAllLines();
      sendResponse({ ok: true });
    } else if (msg.type === 'toggleLinesHidden') {
      toggleLinesHidden();
      sendResponse({ ok: true, hidden: linesHidden });
    } else if (msg.type === 'undoLine') {
      undoLine();
      sendResponse({ ok: true });
    } else if (msg.type === 'redoLine') {
      redoLine();
      sendResponse({ ok: true });
    } else if (msg.type === 'ping') {
      sendResponse({ ok: true });
    }
    return true;
  });

  document.addEventListener(
    'paste',
    async (e) => {
      if (!active) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (!blob) continue;
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = () => createOverlay(reader.result);
          reader.readAsDataURL(blob);
          break;
        }
      }
    },
    true,
  );

  // ========== Alignment lines ==========

  function snapshotLines() {
    return lines.map((l) => ({
      orientation: l.orientation,
      position: l.position,
      color: l.color,
      style: l.style,
    }));
  }

  function pushUndo() {
    lineUndoStack.push(snapshotLines());
    if (lineUndoStack.length > UNDO_MAX) lineUndoStack.shift();
    lineRedoStack = [];
  }

  function restoreSnapshot(snapshot) {
    clearLinesFromDom();
    snapshot.forEach((l) => {
      addLineSilent(l.orientation, l.color, l.style, l.position, { focus: false });
    });
  }

  function undoLine() {
    if (lineUndoStack.length === 0) return;
    lineRedoStack.push(snapshotLines());
    restoreSnapshot(lineUndoStack.pop());
    scheduleSave();
  }

  function redoLine() {
    if (lineRedoStack.length === 0) return;
    lineUndoStack.push(snapshotLines());
    restoreSnapshot(lineRedoStack.pop());
    scheduleSave();
  }

  function addLine(orientation, color, style) {
    pushUndo();
    addLineSilent(orientation, color, style, null, { focus: true });
    scheduleSave();
  }

  function addLineSilent(orientation, color, style, position, opts) {
    const id = 'line-' + ++lineIdSeq;
    if (position == null || !Number.isFinite(position)) {
      position = orientation === 'vertical'
        ? Math.round(window.innerWidth / 2)
        : Math.round(window.innerHeight / 2);
    }
    const line = {
      id,
      orientation,
      position,
      color: color || '#ff0000',
      style: style || 'dashed',
    };
    lines.push(line);
    createLineElement(line, opts && opts.focus);
  }

  function createLineElement(line, focus) {
    const el = document.createElement('div');
    el.className = 'pixeloverlay-line pixeloverlay-line-' + line.orientation;
    el.tabIndex = -1;
    el.dataset.id = line.id;
    el.style.setProperty('--line-color', line.color);
    el.style.setProperty('--line-style', line.style);
    el.setAttribute('aria-label', line.orientation + ' alignment line');
    applyLinePosition(el, line);
    setupLineDrag(el, line);
    setupLineKeyboard(el, line);
    document.documentElement.appendChild(el);
    lineEls.set(line.id, el);
    if (focus) el.focus({ preventScroll: true });
  }

  function applyLinePosition(el, line) {
    if (line.orientation === 'vertical') {
      el.style.left = line.position - LINE_HIT_OFFSET + 'px';
    } else {
      el.style.top = line.position - LINE_HIT_OFFSET + 'px';
    }
  }

  function removeAllLines() {
    if (lines.length === 0) return;
    pushUndo();
    clearLinesFromDom();
    scheduleSave();
  }

  function clearLinesFromDom() {
    lineEls.forEach((el) => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    lineEls.clear();
    lines = [];
  }

  function setLinesHidden(hidden) {
    linesHidden = hidden;
    document.documentElement.classList.toggle('pixeloverlay-lines-hidden', hidden);
    scheduleSave();
  }

  function toggleLinesHidden() {
    setLinesHidden(!linesHidden);
  }

  function setupLineDrag(el, line) {
    let dragging = false;
    let startCoord = 0;
    let startPos = 0;

    function point(e) {
      const isV = line.orientation === 'vertical';
      if (e.touches && e.touches[0]) {
        return isV ? e.touches[0].clientX : e.touches[0].clientY;
      }
      return isV ? e.clientX : e.clientY;
    }

    function onDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      el.focus({ preventScroll: true });
      dragging = true;
      startCoord = point(e);
      startPos = line.position;
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
      document.addEventListener('touchmove', onMove, { capture: true, passive: false });
      document.addEventListener('touchend', onUp, true);
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      const delta = point(e) - startCoord;
      line.position = Math.round(startPos + delta);
      applyLinePosition(el, line);
      scheduleSave();
    }

    function onUp() {
      dragging = false;
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      document.removeEventListener('touchmove', onMove, { capture: true });
      document.removeEventListener('touchend', onUp, true);
    }

    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: false });
  }

  function setupLineKeyboard(el, line) {
    el.addEventListener('keydown', (e) => {
      let delta = 0;
      if (line.orientation === 'vertical') {
        if (e.key === 'ArrowLeft') delta = -1;
        else if (e.key === 'ArrowRight') delta = 1;
      } else if (e.key === 'ArrowUp') {
        delta = -1;
      } else if (e.key === 'ArrowDown') {
        delta = 1;
      }
      if (delta !== 0) {
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 10 : 1;
        line.position += delta * step;
        applyLinePosition(el, line);
        scheduleSave();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        el.blur();
      }
    });
  }

  // ========== Overlay ==========

  const ICON_HIDE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M3.53 2.47a.75.75 0 0 0-1.06 1.06l18 18a.75.75 0 1 0 1.06-1.06l-18-18ZM22.676 12.553a11.249 11.249 0 0 1-2.631 4.31l-3.099-3.099a5.25 5.25 0 0 0-6.71-6.71L7.759 4.577a11.217 11.217 0 0 1 4.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113Z"/>' +
    '<path d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0 1 15.75 12ZM12.53 15.713l-4.243-4.244a3.75 3.75 0 0 0 4.244 4.243Z"/>' +
    '<path d="M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 0 0-2.63 4.31c-.12.362-.12.752 0 1.114 1.489 4.467 5.704 7.69 10.675 7.69 1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 0 1 6.75 12Z"/>' +
    '</svg>';
  const ICON_LOCK =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path fill-rule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clip-rule="evenodd"/>' +
    '</svg>';

  function makeToggleBtn(svg, ariaLabel, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pixeloverlay-toggle';
    b.innerHTML = svg;
    b.title = title;
    b.setAttribute('aria-label', ariaLabel);
    b.setAttribute('aria-pressed', 'false');
    return b;
  }

  function createOverlay(dataUrl, state) {
    removeOverlay({ clearStorage: false });
    currentDataUrl = dataUrl;

    const wrapper = document.createElement('div');
    wrapper.className = 'pixeloverlay-wrapper';
    wrapper.tabIndex = -1;

    const img = document.createElement('img');
    img.className = 'pixeloverlay-image';
    img.draggable = false;
    const initialOpacity = state && typeof state.opacity === 'number' ? state.opacity : DEFAULT_OPACITY;
    img.style.opacity = String(initialOpacity);

    const handle = document.createElement('div');
    handle.className = 'pixeloverlay-handle';
    handle.title = 'Drag to scale (preserves aspect ratio)';

    const controls = document.createElement('div');
    controls.className = 'pixeloverlay-controls';

    const hideBtn = makeToggleBtn(ICON_HIDE, 'Hide overlay', 'Hide overlay (H)');
    const lockBtn = makeToggleBtn(ICON_LOCK, 'Lock position', 'Lock position (L)');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'pixeloverlay-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.title = 'Remove overlay';
    closeBtn.setAttribute('aria-label', 'Remove overlay');

    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.className = 'pixeloverlay-slider';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.step = '1';
    opacitySlider.value = String(Math.round(initialOpacity * 100));
    opacitySlider.title = 'Opacity';
    opacitySlider.setAttribute('aria-label', 'Opacity');

    const opacityLabel = document.createElement('div');
    opacityLabel.className = 'pixeloverlay-slider-label';
    opacityLabel.textContent = `${opacitySlider.value}%`;

    const scaleSlider = document.createElement('input');
    scaleSlider.type = 'range';
    scaleSlider.className = 'pixeloverlay-slider';
    scaleSlider.min = '0';
    scaleSlider.max = '2';
    scaleSlider.step = '0.01';
    scaleSlider.value = '1';
    scaleSlider.title = 'Scale';
    scaleSlider.setAttribute('aria-label', 'Scale');

    const scaleLabel = document.createElement('div');
    scaleLabel.className = 'pixeloverlay-slider-label';
    scaleLabel.textContent = '1.00x';

    const topRow = document.createElement('div');
    topRow.className = 'pixeloverlay-controls-top';
    const toggleGroup = document.createElement('div');
    toggleGroup.className = 'pixeloverlay-toggle-group';
    toggleGroup.appendChild(hideBtn);
    toggleGroup.appendChild(lockBtn);
    topRow.appendChild(toggleGroup);
    topRow.appendChild(closeBtn);

    const slidersRow = document.createElement('div');
    slidersRow.className = 'pixeloverlay-controls-sliders';

    const opacityCol = document.createElement('div');
    opacityCol.className = 'pixeloverlay-slider-col';
    opacityCol.appendChild(opacitySlider);
    opacityCol.appendChild(opacityLabel);

    const scaleCol = document.createElement('div');
    scaleCol.className = 'pixeloverlay-slider-col';
    scaleCol.appendChild(scaleSlider);
    scaleCol.appendChild(scaleLabel);

    slidersRow.appendChild(opacityCol);
    slidersRow.appendChild(scaleCol);

    const readout = document.createElement('div');
    readout.className = 'pixeloverlay-readout';

    controls.appendChild(topRow);
    controls.appendChild(slidersRow);
    controls.appendChild(readout);

    wrapper.appendChild(img);
    wrapper.appendChild(handle);
    wrapper.appendChild(controls);
    document.documentElement.appendChild(wrapper);
    overlay = wrapper;

    function syncScaleSlider() {
      if (!img.naturalWidth) return;
      const w = parseFloat(wrapper.style.width) || wrapper.offsetWidth;
      const s = w / img.naturalWidth;
      scaleSlider.value = Math.min(2, Math.max(0, s)).toFixed(2);
      scaleLabel.textContent = `${s.toFixed(2)}x`;
    }

    function updateReadout() {
      const left = Math.round(parseFloat(wrapper.style.left) || 0);
      const top = Math.round(parseFloat(wrapper.style.top) || 0);
      const w = Math.round(parseFloat(wrapper.style.width) || 0);
      const h = Math.round(parseFloat(wrapper.style.height) || 0);
      readout.textContent = `x: ${left}, y: ${top}\nw: ${w} × h: ${h}`;
    }

    function onChange() {
      syncScaleSlider();
      updateReadout();
      scheduleSave();
    }

    function applyToggleState(btn, on) {
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    function setHide(on) {
      wrapper.classList.toggle('pixeloverlay-hidden', on);
      applyToggleState(hideBtn, on);
      onChange();
    }

    function setLock(on) {
      wrapper.classList.toggle('pixeloverlay-locked', on);
      applyToggleState(lockBtn, on);
      onChange();
    }

    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      wrapper.dataset.ratio = String(ratio);
      if (state && state.width) {
        wrapper.style.width = state.width + 'px';
        wrapper.style.height = state.width / ratio + 'px';
        wrapper.style.left = (state.left || 0) + 'px';
        wrapper.style.top = (state.top || 0) + 'px';
        if (state.locked) setLock(true);
        if (state.hidden) setHide(true);
      } else {
        const maxW = window.innerWidth * 0.8;
        const maxH = window.innerHeight * 0.8;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxW) {
          w = maxW;
          h = w / ratio;
        }
        if (h > maxH) {
          h = maxH;
          w = h * ratio;
        }
        wrapper.style.width = w + 'px';
        wrapper.style.height = h + 'px';
        wrapper.style.left = Math.max(0, (window.innerWidth - w) / 2) + 'px';
        wrapper.style.top = Math.max(0, (window.innerHeight - h) / 2) + 'px';
      }
      syncScaleSlider();
      updateReadout();
      scheduleSave();
    };
    img.src = dataUrl;

    setupInteractions(wrapper, img, handle, onChange);

    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        removeOverlay({ clearStorage: true });
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'h' || e.key === 'H') {
          e.stopPropagation();
          e.preventDefault();
          setHide(!wrapper.classList.contains('pixeloverlay-hidden'));
          return;
        }
        if (e.key === 'l' || e.key === 'L') {
          e.stopPropagation();
          e.preventDefault();
          setLock(!wrapper.classList.contains('pixeloverlay-locked'));
          return;
        }
      }
      if (wrapper.classList.contains('pixeloverlay-locked')) return;
      if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.stopPropagation();
        e.preventDefault();
        const pct = (e.shiftKey ? 10 : 1) / 100;
        const factor = e.key === 'ArrowUp' ? 1 + pct : 1 - pct;
        const r = parseFloat(wrapper.dataset.ratio) || 1;
        const w = parseFloat(wrapper.style.width) || wrapper.offsetWidth;
        const newW = Math.max(MIN_WIDTH, w * factor);
        wrapper.style.width = newW + 'px';
        wrapper.style.height = newW / r + 'px';
        onChange();
        return;
      }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const delta = arrows[e.key];
      if (delta) {
        e.stopPropagation();
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const left = parseFloat(wrapper.style.left) || 0;
        const top = parseFloat(wrapper.style.top) || 0;
        wrapper.style.left = left + delta[0] * step + 'px';
        wrapper.style.top = top + delta[1] * step + 'px';
        onChange();
      }
    });
    wrapper.addEventListener('mousedown', () => wrapper.focus({ preventScroll: true }), true);
    wrapper.focus({ preventScroll: true });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeOverlay({ clearStorage: true });
    });
    closeBtn.addEventListener('mousedown', (e) => e.stopPropagation());

    hideBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setHide(!wrapper.classList.contains('pixeloverlay-hidden'));
    });
    hideBtn.addEventListener('mousedown', (e) => e.stopPropagation());

    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setLock(!wrapper.classList.contains('pixeloverlay-locked'));
    });
    lockBtn.addEventListener('mousedown', (e) => e.stopPropagation());

    opacitySlider.addEventListener('input', () => {
      const v = Number(opacitySlider.value) / 100;
      img.style.opacity = String(v);
      opacityLabel.textContent = `${opacitySlider.value}%`;
      scheduleSave();
    });
    opacitySlider.addEventListener('mousedown', (e) => e.stopPropagation());
    opacitySlider.addEventListener('touchstart', (e) => e.stopPropagation());

    scaleSlider.addEventListener('input', () => {
      const s = parseFloat(scaleSlider.value);
      const r = parseFloat(wrapper.dataset.ratio) || 1;
      const newW = img.naturalWidth * s;
      wrapper.style.width = newW + 'px';
      wrapper.style.height = newW / r + 'px';
      scaleLabel.textContent = `${s.toFixed(2)}x`;
      updateReadout();
      scheduleSave();
    });
    scaleSlider.addEventListener('mousedown', (e) => e.stopPropagation());
    scaleSlider.addEventListener('touchstart', (e) => e.stopPropagation());

    controls.addEventListener('mousedown', (e) => e.stopPropagation());
    controls.addEventListener('touchstart', (e) => e.stopPropagation());
  }

  function setupInteractions(wrapper, img, handle, onChange) {
    let mode = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let startWidth = 0;

    function ratio() {
      return parseFloat(wrapper.dataset.ratio) || 1;
    }

    function point(e) {
      if (e.touches && e.touches[0]) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    }

    function onDown(e, m) {
      if (e.button !== undefined && e.button !== 0) return;
      if (wrapper.classList.contains('pixeloverlay-locked')) return;
      e.preventDefault();
      e.stopPropagation();
      const p = point(e);
      mode = m;
      startX = p.x;
      startY = p.y;
      startLeft = parseFloat(wrapper.style.left) || 0;
      startTop = parseFloat(wrapper.style.top) || 0;
      startWidth = parseFloat(wrapper.style.width) || wrapper.offsetWidth;
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
      document.addEventListener('touchmove', onMove, { capture: true, passive: false });
      document.addEventListener('touchend', onUp, true);
    }

    function onMove(e) {
      if (!mode) return;
      e.preventDefault();
      const p = point(e);
      const dx = p.x - startX;
      const dy = p.y - startY;
      if (mode === 'drag') {
        wrapper.style.left = startLeft + dx + 'px';
        wrapper.style.top = startTop + dy + 'px';
      } else if (mode === 'resize') {
        const r = ratio();
        const newWidth = Math.max(MIN_WIDTH, startWidth + dx);
        wrapper.style.width = newWidth + 'px';
        wrapper.style.height = newWidth / r + 'px';
      }
      if (onChange) onChange();
    }

    function onUp() {
      mode = null;
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      document.removeEventListener('touchmove', onMove, { capture: true });
      document.removeEventListener('touchend', onUp, true);
    }

    img.addEventListener('mousedown', (e) => onDown(e, 'drag'));
    img.addEventListener('touchstart', (e) => onDown(e, 'drag'), { passive: false });
    handle.addEventListener('mousedown', (e) => onDown(e, 'resize'));
    handle.addEventListener('touchstart', (e) => onDown(e, 'resize'), { passive: false });
  }

  function removeOverlay(opts) {
    const clearStorage = !opts || opts.clearStorage !== false;
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
    currentDataUrl = null;
    if (clearStorage) scheduleSave();
  }
})();
