export const TRACK_QUIET_MS = 80;
export const MOMENTUM_LOCK_MS = 450;

export type SwipeDirection = "left" | "right";
export type GesturePhase = "idle" | "tracking" | "locked";

export interface GestureConfig {
	minDeltaX: number;
	dominanceRatio: number;
	invert: boolean;
}

export interface GestureDecision {
	phase: GesturePhase;
	direction: SwipeDirection | null;
	progress: number;
	commit: boolean;
	cancel: boolean;
	preventDefault: boolean;
	/** Milliseconds to arm a quiet timer for, or null to leave the current timer alone. */
	quietMs: number | null;
}

export function commitDistance(minDeltaX: number): number {
	const clamped = Math.min(60, Math.max(2, minDeltaX));
	return 30 + clamped * 3;
}

function resolveDirection(deltaX: number, invert: boolean): SwipeDirection {
	let swipedRight = deltaX > 0;
	if (invert) swipedRight = !swipedRight;
	return swipedRight ? "right" : "left";
}

/** Positive when this wheel tick continues the resolved swipe. */
function signedToward(
	direction: SwipeDirection,
	deltaX: number,
	invert: boolean,
): number {
	const physicalSign = invert
		? direction === "right" ? -1 : 1
		: direction === "right" ? 1 : -1;
	return deltaX * physicalSign;
}

/**
 * One horizontal swipe. The plugin owns the timers: call `onQuiet` when
 * `quietMs` elapses with no further consumed wheel event.
 */
export class SwipeGesture {
	private phase: GesturePhase = "idle";
	private direction: SwipeDirection | null = null;
	private distance = 0;
	private config: GestureConfig;

	constructor(config: GestureConfig) {
		this.config = config;
	}

	setConfig(config: GestureConfig): void {
		this.config = config;
	}

	onWheel(deltaX: number, deltaY: number): GestureDecision {
		if (this.phase === "locked") {
			const horizontal = this.isHorizontal(deltaX, deltaY);
			return this.decide({
				preventDefault: horizontal,
				quietMs: horizontal ? MOMENTUM_LOCK_MS : null,
			});
		}

		if (!this.isHorizontal(deltaX, deltaY)) {
			return this.decide({
				preventDefault: false,
				quietMs: null,
			});
		}

		if (this.phase === "idle") {
			this.phase = "tracking";
			this.direction = resolveDirection(deltaX, this.config.invert);
			this.distance = 0;
		}

		if (this.direction === null) {
			return this.decide({ preventDefault: false, quietMs: null });
		}

		const toward = signedToward(this.direction, deltaX, this.config.invert);
		this.distance = Math.max(0, this.distance + toward);
		return this.decide({
			preventDefault: true,
			quietMs: TRACK_QUIET_MS,
		});
	}

	onQuiet(): GestureDecision {
		if (this.phase === "tracking") {
			const full = this.distance >= commitDistance(this.config.minDeltaX);
			this.phase = "locked";
			return this.decide({
				commit: full,
				cancel: !full,
				preventDefault: false,
				quietMs: MOMENTUM_LOCK_MS,
				progress: full ? 1 : undefined,
			});
		}

		if (this.phase === "locked") {
			this.reset();
			return this.decide({ preventDefault: false, quietMs: null });
		}

		return this.decide({ preventDefault: false, quietMs: null });
	}

	private isHorizontal(deltaX: number, deltaY: number): boolean {
		const absX = Math.abs(deltaX);
		const absY = Math.abs(deltaY);
		if (absX < 0.5) return false;
		return absX > absY * this.config.dominanceRatio;
	}

	private progress(): number {
		const span = commitDistance(this.config.minDeltaX);
		if (span <= 0) return 0;
		return Math.min(1, this.distance / span);
	}

	private reset(): void {
		this.phase = "idle";
		this.direction = null;
		this.distance = 0;
	}

	private decide(partial: {
		preventDefault: boolean;
		quietMs: number | null;
		commit?: boolean;
		cancel?: boolean;
		progress?: number;
	}): GestureDecision {
		return {
			phase: this.phase,
			direction: this.direction,
			progress: partial.progress ?? this.progress(),
			commit: partial.commit ?? false,
			cancel: partial.cancel ?? false,
			preventDefault: partial.preventDefault,
			quietMs: partial.quietMs,
		};
	}
}
