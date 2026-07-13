import {
	App,
	ItemView,
	Plugin,
	PluginSettingTab,
	Setting,
	SliderComponent,
	TextComponent,
} from "obsidian";

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

	private cooldownUntil = 0;
	private overlayEl: HTMLDivElement | null = null;
	private overlayFadeTimer: number | null = null;

	async onload() {
		await this.loadSettings();
		this.registerDomEvent(
			activeDocument,
			"wheel",
			(evt: WheelEvent) => this.handleWheel(evt),
			{ capture: true, passive: true }
		);
		this.addSettingTab(new SwipeGestureSettingTab(this.app, this));
	}

	onunload() {
		this.overlayEl?.remove();
	}

	private handleWheel(evt: WheelEvent) {
		const now = Date.now();
		if (now < this.cooldownUntil) return;

		const absX = Math.abs(evt.deltaX);
		const absY = Math.abs(evt.deltaY);

		if (absX < this.settings.minDeltaX) return;
		if (absX <= absY * this.settings.dominanceRatio) return;

		let swipedRight = evt.deltaX > 0;
		if (this.settings.invert) swipedRight = !swipedRight;

		const direction = swipedRight ? "right" : "left";
		const commandId = swipedRight
			? this.settings.rightCommandId
			: this.settings.leftCommandId;

		this.showOverlay(direction);
		if (commandId) getCommandsManager(this.app).executeCommandById(commandId);

		this.cooldownUntil = now + 600;
	}

	private getNoteBounds(): DOMRect | null {
		const view = this.app.workspace.getActiveViewOfType(ItemView);
		if (!view) return null;
		const viewContent = view.containerEl.querySelector(".view-content");
		const target = viewContent ?? view.containerEl;
		return (target as HTMLElement).getBoundingClientRect();
	}

	private showOverlay(direction: "left" | "right") {
		if (!this.overlayEl) {
			this.overlayEl = activeDocument.body.createDiv({
				attr: { id: "swipe-gesture-overlay" },
			});
		}

		const el = this.overlayEl;
		el.textContent = direction === "left" ? "‹" : "›";

		if (this.overlayFadeTimer !== null) {
			window.clearTimeout(this.overlayFadeTimer);
			this.overlayFadeTimer = null;
		}

		const bounds = this.getNoteBounds();
		el.style.removeProperty("left");
		el.style.removeProperty("right");
		if (bounds) {
			if (direction === "left") {
				el.style.left = `${bounds.left}px`;
			} else {
				el.style.right = `${window.innerWidth - bounds.right}px`;
			}
		}

		el.classList.remove("visible", "fade-out", "left", "right");
		void el.offsetWidth;
		el.classList.add(direction, "visible");

		this.overlayFadeTimer = window.setTimeout(() => {
			el.classList.remove("visible");
			el.classList.add("fade-out");
			this.overlayFadeTimer = null;
		}, 350);
	}

	async loadSettings() {
		const saved = await this.loadData() as Partial<SwipeGestureSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
			.forEach((cmd) => (options[cmd.id] = cmd.name));
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
		}
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
			.setDesc("Command to run on a two-finger swipe left.")
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
			.setDesc("Command to run on a two-finger swipe right.")
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
					"How light a swipe needs to be to trigger. " +
					"Low (2) = fires on the slightest flick. " +
					"High (60) = requires a hard, deliberate swipe."
				),
			{
				min: 2,
				max: 60,
				step: 1,
				get: () => this.plugin.settings.minDeltaX,
				set: (v) => (this.plugin.settings.minDeltaX = v),
			}
		);

		this.addSliderWithInput(
			new Setting(containerEl)
				.setName("Horizontal dominance")
				.setDesc(
					"How purely horizontal your swipe must be. " +
					"Low (1.0) = diagonal swipes count. " +
					"High (4.0) = only nearly straight left/right swipes count."
				),
			{
				min: 1,
				max: 4,
				step: 0.1,
				get: () => this.plugin.settings.dominanceRatio,
				set: (v) => (this.plugin.settings.dominanceRatio = v),
			}
		);
	}
}
