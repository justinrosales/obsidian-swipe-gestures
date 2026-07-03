# Swipe Gesture Commands

An [Obsidian](https://obsidian.md) plugin that maps two-finger horizontal trackpad swipes to any Obsidian command — by default, back and forward navigation.

## How it works

This plugin listens to the browser scroll wheel API (`WheelEvent`), which is the standard way web and Electron apps receive trackpad input on any platform. The plugin reads those values, determines if the movement is horizontal enough, and fires the configured command.

This approach means the plugin is **not** relying on any proprietary Apple gesture API — it works wherever `WheelEvent.deltaX` is available, which covers macOS, Windows, and Linux trackpads, as well as mice with horizontal scroll wheels.

## Features

- Map any Obsidian command to swipe left or swipe right
- Configurable swipe sensitivity and horizontal dominance
- Visual half-circle indicator at the edge of the active note on trigger
- macOS momentum scroll filtering — releases after your finger lifts, not during the inertia tail
- Desktop only (trackpad/mouse input)

## Installation

### Simple (recommended)

1. Clone or download this repo directly into your vault's plugin folder:
```bash
cd <your vault>/.obsidian/plugins
git clone https://github.com/justinrosales/obsidian-swipe-gestures
```
2. Reload Obsidian and enable **Swipe Gesture Commands** in **Settings → Community Plugins**

That's it — no build step needed, `main.js` is included in the repo.

### From source

```bash
cd <your vault>/.obsidian/plugins
git clone https://github.com/justinrosales/obsidian-swipe-gestures
cd obsidian-swipe-gestures
npm install
npm run build
```

Then reload Obsidian and enable the plugin.

## Settings

| Setting | Description |
|---|---|
| **Swipe left action** | Command to run on a left swipe (default: Navigate back) |
| **Swipe right action** | Command to run on a right swipe (default: Navigate forward) |
| **Invert direction** | Flip left/right if the directions feel reversed |
| **Swipe sensitivity** | How light a swipe needs to be to trigger. Low = fires on a light flick, High = requires a more deliberate swipe |
| **Horizontal dominance** | How purely horizontal the swipe must be. Low = diagonal swipes count, High = only straight left/right swipes count |

## Releasing a new version

1. Update the version in `manifest.json` and `versions.json`
2. Run `npm version patch` (or `minor` / `major`) to bump `package.json` and tag the commit
3. Create a GitHub release with that tag and attach `main.js` and `manifest.json`

