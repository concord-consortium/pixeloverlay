# PixelOverlay

A minimal Chrome extension that drops a clipboard image onto the current page as a
translucent, draggable, scalable overlay — for comparing a designer's spec against
what's actually rendered in the browser.

## Features

- Paste an image from the clipboard onto any page as an overlay
- Drag the overlay anywhere on the page
- Scale via the blue corner handle (aspect ratio preserved)
- Side panel with vertical sliders for opacity (0–100%, default 50%) and scale (0–2×)
- Full keyboard control: nudge, scale, and close from the keyboard
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

## Keyboard

The overlay is focused by default after paste, and is refocused whenever you click on
it. While it has focus:

| Keys                                                    | Action                          |
| ------------------------------------------------------- | ------------------------------- |
| <kbd>Esc</kbd>                                          | Close the overlay               |
| <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd>     | Nudge 1px                       |
| <kbd>Shift</kbd> + arrow                                | Nudge 10px                      |
| <kbd>Ctrl</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd>           | Scale ±1% (aspect ratio locked) |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | Scale ±10%              |

Click the overlay to give it focus if a page element has taken focus from it.

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
