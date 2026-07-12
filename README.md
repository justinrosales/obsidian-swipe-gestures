# Horizontal Swipe Gestures

An [Obsidian](https://obsidian.md) plugin that maps two-finger horizontal trackpad swipes to any command — back/forward navigation by default.

## How it works

Listens to the browser `WheelEvent` API (how web/Electron apps receive trackpad input on any platform), detects horizontal-enough movement, and fires the configured command. No proprietary Apple gesture API.

## Features

- Map any Obsidian command to swipe left or right
- Configurable sensitivity and horizontal dominance
- Visual half-circle indicator on trigger
- macOS momentum scroll filtering — releases after your finger lifts, not during the inertia tail
- Desktop only (trackpad/mouse)

## Installation

Clone into your vault's plugin folder:
```bash
cd <your vault>/.obsidian/plugins
git clone https://github.com/justinrosales/obsidian-swipe-gestures
```
Reload Obsidian and enable **Horizontal Swipe Gestures** in **Settings → Community Plugins**. No build step — `main.js` is included.

To build from source: `npm install && npm run build` in the plugin folder.

## Settings

| Setting | Description |
|---|---|
| **Swipe left action** | Command on left swipe (default: Navigate back) |
| **Swipe right action** | Command on right swipe (default: Navigate forward) |
| **Invert direction** | Flip left/right if reversed |
| **Swipe sensitivity** | Low = light flick triggers, High = deliberate swipe |
| **Horizontal dominance** | Low = diagonal counts, High = only straight left/right |

