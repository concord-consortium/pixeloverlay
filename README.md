# PixelOverlay

A minimal Chrome extension that drops a clipboard image onto the current page as a
translucent, draggable, scalable overlay — for comparing a designer's spec against
what's actually rendered in the browser.

## Features

- Paste an image from the clipboard onto any page as an overlay
- Drag the overlay anywhere on the page
- Scale via the blue corner handle (aspect ratio preserved)
- Side panel with vertical sliders for opacity (0–100%, default 50%) and scale (0–2×)
- Live x/y/w/h readout in the side panel
- **Hide/show** toggle — flash the overlay off to see the underlying page without losing position
- **Lock** toggle — when locked, clicks pass through to the page below so you can interact with
  what's underneath
- **Per-URL persistence** — image, position, scale, opacity, and toggles persist across page
  reloads (keyed by origin + pathname)
- Full keyboard control: nudge, scale, toggle hide/lock, and close
- One-click clear

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder

Existing browser tabs need a reload for the content script to inject.
New tabs work immediately.

## Use

1. Click the PixelOverlay toolbar icon and **Turn On**
2. Copy a design image to the clipboard (e.g. from Figma, a screenshot, or a file)
3. Either:
   - Click **Paste image now** in the popup, **or**
   - Focus the page and press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>V</kbd>
4. Drag the image to move. Drag the blue corner to scale. Use the side
   panel sliders for opacity and scale. Click the **×** to remove.

## Side panel

To the right of the image, the panel has:

- **H / L** toggle buttons — Hide, Lock
- **×** — close (also clears persisted state for this URL)
- Vertical opacity slider (0–100%) with `%` label
- Vertical scale slider (0–2×) with `Nx` label, synced with corner-handle resizing
- An x/y/w/h readout below the sliders

## Keyboard

The overlay is focused by default after paste, and is refocused whenever you click on
it. While it has focus:

| Keys                                                            | Action                          |
| --------------------------------------------------------------- | ------------------------------- |
| <kbd>Esc</kbd>                                                  | Close and clear stored state    |
| <kbd>H</kbd>                                                    | Toggle hide / show              |
| <kbd>L</kbd>                                                    | Toggle lock                     |
| <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd>             | Nudge 1px                       |
| <kbd>Shift</kbd> + arrow                                        | Nudge 10px                      |
| <kbd>Ctrl</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd>                   | Scale ±1% (aspect ratio locked) |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | Scale ±10%                    |

Click the overlay to give it focus if a page element has taken focus from it.

## Persistence

When you paste, drag, scale, or toggle, the current state (image + position + scale + opacity +
toggles) is debounced-saved to `chrome.storage.local` under
`overlay:<origin><pathname>`. On page load (or when you turn the extension back on) the overlay is
restored from that record. Closing via the **×** button or <kbd>Esc</kbd> clears the record;
toggling the extension off does *not* (so you can flip it back on without re-pasting).

Note: the image is stored as a data URL. `chrome.storage.local` has a quota (~10MB total), so very
large pasted images on many different URLs could eventually hit the limit.

## Permissions

- `clipboardRead` — read images from the clipboard when you click "Paste image now"
- `storage` — remember the on/off state across tabs and sessions
- `activeTab` / `scripting` — inject the overlay into the current page
- `<all_urls>` — needed because design comparisons happen on any site

## Limitations

- Cannot run on `chrome://` pages, the Chrome Web Store, or other restricted URLs
- True "background" clipboard polling is not possible in Chrome extensions; the
  paste event (or the popup button) is the trigger

## Icons

Icons use [Heroicons](https://heroicons.com) `square-2-stack` (MIT license).
