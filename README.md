# Horizontal Swipe Gestures

An [Obsidian](https://obsidian.md) plugin that maps two-finger horizontal trackpad swipes to any command — back/forward navigation by default.

## How it works

Listens to the browser `WheelEvent` API (how web/Electron apps receive trackpad input on any platform), accumulates a horizontal swipe, and previews an edge arrow that follows your fingers. The command runs once, after you release past the threshold. No proprietary Apple gesture API.

## Features

- Map any Obsidian command to swipe left or right
- Configurable sensitivity and horizontal dominance
- Safari-style arrow that slides in from the window edge and tracks the swipe
- One navigation per gesture — macOS momentum after a page change cannot step history again
- Reset button restores the default commands and sliders
- Desktop only (trackpad/mouse)

## Installation

Clone into your vault's plugin folder:
```bash
cd <your vault>/.obsidian/plugins
git clone https://github.com/Johann-Goncalves-Pereira/obsidian-swipe-gestures
```
Reload Obsidian and enable **Horizontal Swipe Gestures** in **Settings → Community Plugins**. No build step — `main.js` is included.

To build from source: `npm install && npm run build` in the plugin folder.

## Settings

| Setting | Description |
|---|---|
| **Swipe left action** | Command on left swipe (default: Navigate back) |
| **Swipe right action** | Command on right swipe (default: Navigate forward) |
| **Invert direction** | Flip left/right if reversed |
| **Swipe sensitivity** | Low = a short flick fills the arrow, High = a longer drag |
| **Horizontal dominance** | Low = diagonal counts, High = only straight left/right |
| **Reset settings** | Restore commands, sensitivity, dominance, and invert |

