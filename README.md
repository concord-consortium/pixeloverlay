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
- **Alignment lines** — add movable vertical or horizontal guide lines with configurable color
  and style; drag with mouse or nudge with arrow keys; undo/redo; hide-all and remove-all

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

## Alignment lines

In the popup, the **Alignment lines** section lets you drop thin movable guide lines onto the page
for checking horizontal/vertical alignment.

- **Color** + **Style** pickers (default red dashed) — apply to *newly added* lines; existing
  lines keep their style. The chosen color/style is remembered across popup sessions.
- **+ Vertical** / **+ Horizontal** — adds a line at viewport center; the new line is auto-focused
  so arrow keys immediately move it.
- **Hide all** — toggle line visibility without removing them.
- **Remove all** — clears every line (undoable).
- **Undo** / **Redo** — covers add and remove-all operations (in-memory only; cleared on page
  reload). Position changes are *not* tracked by undo.

Per-line interaction:

- Drag the line with the mouse to move it (vertical lines move horizontally; horizontal lines
  move vertically).
- Click a line to focus it (the hit area shows a faint yellow tint), then:
  - <kbd>←</kbd>/<kbd>→</kbd> (vertical) or <kbd>↑</kbd>/<kbd>↓</kbd> (horizontal) — nudge 1px
  - <kbd>Shift</kbd> + arrow — nudge 10px
  - <kbd>Esc</kbd> — blur the line

Lines also persist per URL alongside the overlay state.

## Persistence

When you paste, drag, scale, toggle, or edit lines, the current state (image + position + scale +
opacity + toggles + lines) is debounced-saved to `chrome.storage.local` under
`overlay:<origin><pathname>`. On page load (or when you turn the extension back on) both the
overlay and any lines are restored from that record. Closing the overlay via **×** or <kbd>Esc</kbd>
clears the overlay portion (lines remain); **Remove all** clears just the lines. Toggling the
extension off does *not* clear storage (so you can flip it back on without re-doing setup).

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

The toolbar icon is a custom SVG ([icons/icon.svg](icons/icon.svg)) — a translucent gray
rectangle with a red dashed vertical and horizontal guide line. PNGs at 16/48/128 are
rendered from it.

In-UI icons use [Heroicons](https://heroicons.com) (MIT license):

- `eye-slash` — overlay hide toggle / popup hide-all-lines
- `lock-closed` — overlay lock toggle
- `view-columns` / `bars-3` — popup add vertical / horizontal line
- `trash` — popup remove-all lines
- `arrow-uturn-left` / `arrow-uturn-right` — popup undo / redo
