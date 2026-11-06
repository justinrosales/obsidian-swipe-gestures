import {
	App,
	ItemView,
	Plugin,
	PluginSettingTab,
	Setting,
	SliderComponent,
	TextComponent,
} from "obsidian";

import {
	SwipeGesture,
	type GestureDecision,
	type SwipeDirection,
} from "./gesture";

/* -------------------------------------------------------------------------- */
/*  Obsidian internals                                                         */
/* -------------------------------------------------------------------------- */

interface ObsidianCommand {
	id: string;
	name: string;
}

interface CommandsManager {
	commands: Record<string, ObsidianCommand>;
	executeCommandById: (id: string) => boolean;
}

function getCommandsManager(app: App): CommandsManager {
	// app.commands is undocumented but stable — cast through unknown to avoid any
	return (app as unknown as { commands: CommandsManager }).commands;
}

/* -------------------------------------------------------------------------- */
/*  Settings                                                                   */
/* -------------------------------------------------------------------------- */

interface SwipeGestureSettings {
	leftCommandId: string;
	rightCommandId: string;
	dominanceRatio: number;
	minDeltaX: number;
	invert: boolean;
}

const DEFAULT_SETTINGS: SwipeGestureSettings = {
	leftCommandId: "app:go-back",
	rightCommandId: "app:go-forward",
	dominanceRatio: 1.2,
	minDeltaX: 5,
	invert: false,
};

/* -------------------------------------------------------------------------- */
/*  Plugin                                                                     */
/* -------------------------------------------------------------------------- */

export default class SwipeGesturesPlugin extends Plugin {
	settings!: SwipeGestureSettings;

	private readonly gesture = new SwipeGesture({
		minDeltaX: DEFAULT_SETTINGS.minDeltaX,
		dominanceRatio: DEFAULT_SETTINGS.dominanceRatio,
		invert: DEFAULT_SETTINGS.invert,
	});

	private indicator: HTMLDivElement | null = null;
	private quietTimer: number | null = null;
	private commandTimer: number | null = null;
	private anchorEdge: number | null = null;
	private anchorCenter: number | null = null;
	private unloaded = false;

	async onload() {
		await this.loadSettings();
		this.registerDomEvent(
			activeDocument,
			"wheel",
			(evt: WheelEvent) => this.handleWheel(evt),
			{ capture: true, passive: false },
		);
		this.addSettingTab(new SwipeGestureSettingTab(this.app, this));
	}

	onunload() {
		this.unloaded = true;
		this.clearQuietTimer();
		this.clearCommandTimer();
		this.indicator?.remove();
		this.indicator = null;
	}

	private handleWheel(evt: WheelEvent) {
		if (this.gesture.isIdle && !this.isEventInNote(evt)) return;
		this.gesture.setConfig({
			minDeltaX: this.settings.minDeltaX,
			dominanceRatio: this.settings.dominanceRatio,
			invert: this.settings.invert,
		});
		this.apply(this.gesture.onWheel(evt.deltaX, evt.deltaY), evt);
	}

	private apply(frame: GestureDecision, evt?: WheelEvent) {
		if (evt && frame.preventDefault && evt.cancelable) evt.preventDefault();
		if (frame.quietMs !== null) this.armQuiet(frame.quietMs);

		const doc = evt?.view?.document ?? this.indicator?.ownerDocument ?? activeDocument;

		if (frame.phase === "tracking" && frame.direction) {
			this.paintLive(doc, frame.direction, frame.progress);
			return;
		}
		if (frame.commit && frame.direction) {
			this.playCommit(doc, frame.direction);
			return;
		}
		if (frame.cancel && frame.direction) {
			this.playCancel(doc, frame.direction, frame.progress);
			return;
		}
		if (frame.phase === "idle") this.parkIndicator();
	}

	private paintLive(doc: Document, direction: SwipeDirection, progress: number) {
		const el = this.ensureIndicator(doc);
		el.classList.remove("settling", "commit", "cancel", "fade-out");
		this.place(el, direction, progress, Math.min(1, 0.25 + progress));
	}

	private playCommit(doc: Document, direction: SwipeDirection) {
		const commandId = direction === "right"
			? this.settings.rightCommandId
			: this.settings.leftCommandId;
		const el = this.ensureIndicator(doc);
		el.classList.remove("cancel", "fade-out");
		el.classList.add("settling", "commit");
		this.place(el, direction, 1, 1);
		this.clearCommandTimer();
		// Leave the wheel event before swapping the note, so the sidebar
		// does not repaint underneath the gesture. The wait is one turn.
		this.commandTimer = window.setTimeout(() => {
			this.commandTimer = null;
			if (this.unloaded) return;
			if (commandId) getCommandsManager(this.app).executeCommandById(commandId);
			el.classList.add("fade-out");
			el.setCssProps({ "--swipe-opacity": "0" });
		}, 0);
	}

	private playCancel(doc: Document, direction: SwipeDirection, progress: number) {
		const el = this.ensureIndicator(doc);
		el.classList.remove("commit", "fade-out");
		this.place(el, direction, progress, Math.min(1, 0.25 + progress));
		el.classList.add("settling", "cancel");
		const view = el.ownerDocument.defaultView ?? window;
		view.requestAnimationFrame(() => {
			if (this.unloaded) return;
			this.place(el, direction, 0, 0);
		});
	}

	private place(
		el: HTMLDivElement,
		direction: SwipeDirection,
		progress: number,
		opacity: number,
	) {
		el.classList.toggle("left", direction === "left");
		el.classList.toggle("right", direction === "right");
		if (this.anchorEdge === null || this.anchorCenter === null) {
			this.captureAnchor(direction);
		}
		el.setCssProps({
			"--swipe-progress": progress.toFixed(4),
			"--swipe-opacity": String(opacity),
			"--swipe-edge": `${this.anchorEdge ?? 0}px`,
			"--swipe-center": `${this.anchorCenter ?? 0}px`,
		});
	}

	private ensureIndicator(doc: Document): HTMLDivElement {
		if (this.indicator && this.indicator.ownerDocument !== doc) {
			this.indicator.remove();
			this.indicator = null;
		}
		if (this.indicator) return this.indicator;

		const el = doc.body.createDiv({
			attr: { id: "swipe-gesture-overlay", "aria-hidden": "true" },
		});
		const svg = el.createSvg("svg", {
			cls: "swipe-gesture-chevron",
			attr: { viewBox: "0 0 24 24", "aria-hidden": "true" },
		});
		svg.createSvg("path", {
			attr: {
				d: "M9 5l7 7-7 7",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": "2.6",
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
			},
		});
		this.indicator = el;
		return el;
	}

	private noteContent(): HTMLElement | null {
		const view = this.app.workspace.getActiveViewOfType(ItemView);
		if (!view) return null;
		const content = view.containerEl.querySelector(".view-content");
		return content instanceof HTMLElement ? content : view.containerEl;
	}

	private isEventInNote(evt: WheelEvent): boolean {
		const content = this.noteContent();
		const target = evt.target;
		return content !== null && target instanceof Node && content.contains(target);
	}

	private captureAnchor(direction: SwipeDirection) {
		const content = this.noteContent();
		const view = content?.ownerDocument.defaultView ?? window;
		if (!content) {
			this.anchorEdge = direction === "left" ? 0 : view.innerWidth;
			this.anchorCenter = view.innerHeight / 2;
			return;
		}
		const bounds = content.getBoundingClientRect();
		this.anchorEdge = direction === "left" ? bounds.left : bounds.right;
		this.anchorCenter = bounds.top + bounds.height / 2;
	}

	private parkIndicator() {
		const el = this.indicator;
		this.anchorEdge = null;
		this.anchorCenter = null;
		if (!el) return;
		el.classList.remove("settling", "commit", "cancel", "fade-out", "left", "right");
		el.setCssProps({
			"--swipe-progress": "0",
			"--swipe-opacity": "0",
		});
	}

	private armQuiet(ms: number) {
		this.clearQuietTimer();
		this.quietTimer = window.setTimeout(() => {
			this.quietTimer = null;
			if (this.unloaded) return;
			this.apply(this.gesture.onQuiet());
		}, ms);
	}

	private clearQuietTimer() {
		if (this.quietTimer === null) return;
		window.clearTimeout(this.quietTimer);
		this.quietTimer = null;
	}

	private clearCommandTimer() {
		if (this.commandTimer === null) return;
		window.clearTimeout(this.commandTimer);
		this.commandTimer = null;
	}

	async loadSettings() {
		const saved = await this.loadData() as Partial<SwipeGestureSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	resetSettings() {
		this.settings = { ...DEFAULT_SETTINGS };
		return this.saveSettings();
	}
}

/* -------------------------------------------------------------------------- */
/*  Settings tab                                                               */
/* -------------------------------------------------------------------------- */

class SwipeGestureSettingTab extends PluginSettingTab {
	plugin: SwipeGesturesPlugin;

	constructor(app: App, plugin: SwipeGesturesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private commandOptions(): Record<string, string> {
		const all = getCommandsManager(this.app).commands;
		const options: Record<string, string> = { "": "— Do nothing —" };
		Object.values(all)
			.sort((a, b) => a.name.localeCompare(b.name))
			.forEach((cmd) => {
				options[cmd.id] = cmd.name;
			});
		return options;
	}

	private addSliderWithInput(
		setting: Setting,
		opts: {
			min: number;
			max: number;
			step: number;
			get: () => number;
			set: (v: number) => void;
		},
	) {
		const { min, max, step } = opts;
		const decimals = step < 1 ? (String(step).split(".")[1] ?? "").length : 0;
		let slider!: SliderComponent;
		let text!: TextComponent;

		setting
			.addSlider((s) => {
				slider = s
					.setLimits(min, max, step)
					.setValue(opts.get())
					// Only commit on release, not on every drag tick,
					// otherwise each pixel of movement writes settings to disk and the drag feels laggy.
					.setInstant(false)
					.onChange(async (v) => {
						opts.set(v);
						text.setValue(v.toFixed(decimals));
						await this.plugin.saveSettings();
					});
			})
			.addText((t) => {
				text = t;
				t.inputEl.type = "number";
				t.inputEl.step = String(step);
				t.inputEl.addClass("swipe-gesture-value-input");
				t.setValue(opts.get().toFixed(decimals)).onChange(async (v) => {
					if (v.trim() === "") return; // still typing — don't snap to min yet
					const num = Number(v);
					if (Number.isNaN(num)) return;
					const clamped = Math.min(max, Math.max(min, num));
					opts.set(clamped);
					slider.setValue(clamped);
					await this.plugin.saveSettings();
				});
			});
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const options = this.commandOptions();

		new Setting(containerEl)
			.setName("Swipe left action")
			.setDesc("Command to run on a two-finger swipe left. The arrow comes in from the left edge.")
			.addDropdown((dd) =>
				dd
					.addOptions(options)
					.setValue(this.plugin.settings.leftCommandId)
					.onChange(async (v) => {
						this.plugin.settings.leftCommandId = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Swipe right action")
			.setDesc("Command to run on a two-finger swipe right. The arrow comes in from the right edge.")
			.addDropdown((dd) =>
				dd
					.addOptions(options)
					.setValue(this.plugin.settings.rightCommandId)
					.onChange(async (v) => {
						this.plugin.settings.rightCommandId = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Invert direction")
			.setDesc("Turn on if left/right feel swapped.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.invert)
					.onChange(async (v) => {
						this.plugin.settings.invert = v;
						await this.plugin.saveSettings();
					})
			);

		this.addSliderWithInput(
			new Setting(containerEl)
				.setName("Swipe sensitivity")
				.setDesc(
					"How far a swipe must travel before it commits. " +
					"Low (2) = a short flick fills the arrow. " +
					"High (60) = a longer, deliberate drag.",
				),
			{
				min: 2,
				max: 60,
				step: 1,
				get: () => this.plugin.settings.minDeltaX,
				set: (v) => {
					this.plugin.settings.minDeltaX = v;
				},
			},
		);

		this.addSliderWithInput(
			new Setting(containerEl)
				.setName("Horizontal dominance")
				.setDesc(
					"How purely horizontal your swipe must be. " +
					"Low (1.0) = diagonal swipes count. " +
					"High (4.0) = only nearly straight left/right swipes count.",
				),
			{
				min: 1,
				max: 4,
				step: 0.1,
				get: () => this.plugin.settings.dominanceRatio,
				set: (v) => {
					this.plugin.settings.dominanceRatio = v;
				},
			},
		);

		new Setting(containerEl)
			.setName("Reset settings")
			.setDesc("Restore swipe actions, sensitivity, dominance, and invert to their defaults.")
			.addButton((btn) => {
				btn
					.setButtonText("Reset")
					.setWarning()
					.onClick(async () => {
						await this.plugin.resetSettings();
						this.display();
					});
			});
	}
}
