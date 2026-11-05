import assert from "node:assert/strict";
import { test } from "node:test";

import {
	MOMENTUM_LOCK_MS,
	SwipeGesture,
	TRACK_QUIET_MS,
	commitDistance,
	type GestureConfig,
} from "./gesture.ts";

const config: GestureConfig = {
	minDeltaX: 5,
	dominanceRatio: 1.2,
	invert: false,
};

function gesture(overrides: Partial<GestureConfig> = {}): SwipeGesture {
	return new SwipeGesture({ ...config, ...overrides });
}

void test("commit distance grows with the sensitivity slider", () => {
	assert.equal(commitDistance(5), 45);
	assert.ok(commitDistance(2) < commitDistance(5));
	assert.ok(commitDistance(5) < commitDistance(60));
	assert.equal(commitDistance(60), 210);
});

void test("vertical scrolling does not start a gesture", () => {
	const frame = gesture().onWheel(2, 40);
	assert.equal(frame.phase, "idle");
	assert.equal(frame.preventDefault, false);
	assert.equal(frame.commit, false);
	assert.equal(frame.cancel, false);
	assert.equal(frame.quietMs, null);
});

void test("a diagonal at the dominance boundary does not start", () => {
	const frame = gesture().onWheel(12, 10);
	assert.equal(frame.phase, "idle");
	assert.equal(frame.preventDefault, false);
});

void test("negative deltaX tracks a left swipe and does not commit yet", () => {
	const frame = gesture().onWheel(-15, 1);
	assert.equal(frame.phase, "tracking");
	assert.equal(frame.direction, "left");
	assert.equal(frame.preventDefault, true);
	assert.equal(frame.commit, false);
	assert.equal(frame.quietMs, TRACK_QUIET_MS);
	assert.ok(Math.abs(frame.progress - 15 / 45) < 1e-9);
});

void test("positive deltaX tracks a right swipe", () => {
	const frame = gesture().onWheel(15, 0);
	assert.equal(frame.direction, "right");
	assert.equal(frame.phase, "tracking");
});

void test("invert swaps the resolved direction and keeps accumulating that way", () => {
	const swipe = gesture({ invert: true });
	const started = swipe.onWheel(10, 0);
	assert.equal(started.direction, "left");
	const continued = swipe.onWheel(10, 0);
	assert.equal(continued.direction, "left");
	assert.ok(continued.progress > started.progress);
	const reversed = swipe.onWheel(-10, 0);
	assert.ok(reversed.progress < continued.progress);
});

void test("opposite motion scrubs progress back down", () => {
	const swipe = gesture();
	swipe.onWheel(-20, 0);
	const back = swipe.onWheel(10, 0);
	assert.equal(back.direction, "left");
	assert.ok(Math.abs(back.progress - 10 / 45) < 1e-9);
});

void test("progress caps at 1 before the finger lifts", () => {
	const frame = gesture().onWheel(-400, 0);
	assert.equal(frame.progress, 1);
	assert.equal(frame.commit, false);
	assert.equal(frame.phase, "tracking");
});

void test("a quiet gap before the threshold cancels once", () => {
	const swipe = gesture();
	swipe.onWheel(-15, 0);
	const settled = swipe.onQuiet();
	assert.equal(settled.cancel, true);
	assert.equal(settled.commit, false);
	assert.equal(settled.phase, "locked");
	assert.equal(settled.direction, "left");
	assert.equal(settled.quietMs, MOMENTUM_LOCK_MS);
	assert.ok(Math.abs(settled.progress - 15 / 45) < 1e-9);

	const again = swipe.onQuiet();
	assert.equal(again.cancel, false);
	assert.equal(again.commit, false);
	assert.equal(again.phase, "idle");
});

void test("a quiet gap at full progress commits once", () => {
	const swipe = gesture();
	swipe.onWheel(-50, 0);
	const settled = swipe.onQuiet();
	assert.equal(settled.commit, true);
	assert.equal(settled.cancel, false);
	assert.equal(settled.progress, 1);
	assert.equal(settled.phase, "locked");
	assert.equal(settled.direction, "left");

	const tail = swipe.onWheel(-30, 0);
	assert.equal(tail.commit, false);
	assert.equal(tail.cancel, false);
	assert.equal(tail.phase, "locked");
	assert.equal(tail.preventDefault, true);
	assert.equal(tail.quietMs, MOMENTUM_LOCK_MS);

	const idle = swipe.onQuiet();
	assert.equal(idle.phase, "idle");
	assert.equal(idle.commit, false);
});

void test("the momentum tail cannot start a second navigation", () => {
	const swipe = gesture();
	swipe.onWheel(-50, 0);
	swipe.onQuiet();
	swipe.onWheel(-40, 0);
	swipe.onWheel(-20, 0);
	const idle = swipe.onQuiet();
	assert.equal(idle.phase, "idle");

	const next = swipe.onWheel(-50, 0);
	assert.equal(next.phase, "tracking");
	assert.equal(next.commit, false);
	const second = swipe.onQuiet();
	assert.equal(second.commit, true);
});

void test("a vertical tick during tracking does not clear the pending quiet gap", () => {
	const swipe = gesture();
	swipe.onWheel(-15, 0);
	const vertical = swipe.onWheel(1, 30);
	assert.equal(vertical.phase, "tracking");
	assert.equal(vertical.preventDefault, false);
	assert.equal(vertical.quietMs, null);
	assert.ok(Math.abs(vertical.progress - 15 / 45) < 1e-9);
});
