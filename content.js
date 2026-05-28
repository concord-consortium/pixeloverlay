(function () {
  if (window.__pixelOverlayInjected) return;
  window.__pixelOverlayInjected = true;

  const DEFAULT_OPACITY = 0.5;
  const MIN_WIDTH = 20;

  let overlay = null;
  let active = false;

  chrome.storage.local.get(['active'], (data) => {
    active = !!data.active;
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'setActive') {
      active = !!msg.active;
      if (!active) removeOverlay();
      sendResponse({ ok: true });
    } else if (msg.type === 'showImage') {
      createOverlay(msg.dataUrl);
      sendResponse({ ok: true });
    } else if (msg.type === 'clearOverlay') {
      removeOverlay();
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

  function createOverlay(dataUrl) {
    removeOverlay();

    const wrapper = document.createElement('div');
    wrapper.className = 'pixeloverlay-wrapper';
    wrapper.tabIndex = -1;

    const img = document.createElement('img');
    img.className = 'pixeloverlay-image';
    img.draggable = false;
    img.style.opacity = String(DEFAULT_OPACITY);

    const handle = document.createElement('div');
    handle.className = 'pixeloverlay-handle';
    handle.title = 'Drag to scale (preserves aspect ratio)';

    const controls = document.createElement('div');
    controls.className = 'pixeloverlay-controls';

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
    opacitySlider.value = String(Math.round(DEFAULT_OPACITY * 100));
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

    controls.appendChild(topRow);
    controls.appendChild(slidersRow);

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

    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      wrapper.dataset.ratio = String(ratio);
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
      syncScaleSlider();
    };
    img.src = dataUrl;

    setupInteractions(wrapper, img, handle, syncScaleSlider);

    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        removeOverlay();
        return;
      }
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
        syncScaleSlider();
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
      }
    });
    wrapper.addEventListener('mousedown', () => wrapper.focus({ preventScroll: true }), true);
    wrapper.focus({ preventScroll: true });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeOverlay();
    });
    closeBtn.addEventListener('mousedown', (e) => e.stopPropagation());

    opacitySlider.addEventListener('input', () => {
      const v = Number(opacitySlider.value) / 100;
      img.style.opacity = String(v);
      opacityLabel.textContent = `${opacitySlider.value}%`;
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
    });
    scaleSlider.addEventListener('mousedown', (e) => e.stopPropagation());
    scaleSlider.addEventListener('touchstart', (e) => e.stopPropagation());

    controls.addEventListener('mousedown', (e) => e.stopPropagation());
    controls.addEventListener('touchstart', (e) => e.stopPropagation());
  }

  function setupInteractions(wrapper, img, handle, onResize) {
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
        if (onResize) onResize();
      }
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

  function removeOverlay() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
  }
})();
