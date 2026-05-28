const statusEl = document.getElementById('status');
const toggleBtn = document.getElementById('toggle');
const pasteBtn = document.getElementById('paste');
const clearBtn = document.getElementById('clear');
const errorEl = document.getElementById('error');

function render(active) {
  statusEl.textContent = active ? 'On' : 'Off';
  statusEl.className = 'status ' + (active ? 'on' : 'off');
  toggleBtn.textContent = active ? 'Turn Off' : 'Turn On';
  toggleBtn.classList.toggle('primary', !active);
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function sendToContent(tabId, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (err) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content.css'],
    });
    return await chrome.tabs.sendMessage(tabId, payload);
  }
}

chrome.storage.local.get(['active'], ({ active }) => render(!!active));

toggleBtn.addEventListener('click', async () => {
  clearError();
  const { active } = await chrome.storage.local.get(['active']);
  const next = !active;
  await chrome.storage.local.set({ active: next });
  render(next);
  const tab = await getActiveTab();
  if (!tab) return;
  try {
    await sendToContent(tab.id, { type: 'setActive', active: next });
  } catch (err) {
    showError('Cannot run on this page (chrome://, web store, etc.).');
  }
});

pasteBtn.addEventListener('click', async () => {
  clearError();
  try {
    const items = await navigator.clipboard.read();
    let dataUrl = null;
    for (const item of items) {
      const imgType = item.types.find((t) => t.startsWith('image/'));
      if (imgType) {
        const blob = await item.getType(imgType);
        dataUrl = await blobToDataUrl(blob);
        break;
      }
    }
    if (!dataUrl) {
      showError('No image found in clipboard.');
      return;
    }
    const tab = await getActiveTab();
    if (!tab) return;
    await chrome.storage.local.set({ active: true });
    render(true);
    await sendToContent(tab.id, { type: 'setActive', active: true });
    await sendToContent(tab.id, { type: 'showImage', dataUrl });
    window.close();
  } catch (err) {
    showError(err.message || 'Could not read clipboard.');
  }
});

clearBtn.addEventListener('click', async () => {
  clearError();
  const tab = await getActiveTab();
  if (!tab) return;
  try {
    await sendToContent(tab.id, { type: 'clearOverlay' });
  } catch (err) {
    showError('Cannot run on this page.');
  }
});
