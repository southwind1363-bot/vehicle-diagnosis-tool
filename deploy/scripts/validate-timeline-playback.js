import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const helper = source.match(/function createObdTimelinePlaybackButton\([^)]*\) \{[\s\S]*?\r?\n\}/)?.[0];
assert.ok(helper);
let now = 0, serial = 0, checks = 0;
const frames = new Map();
const check = (test, message) => { assert.ok(test, message); checks += 1; };
class Element {
  constructor() { this.listeners = new Map(); this.attributes = {}; this.value = "0"; this.isConnected = true; this.visible = true; }
  addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(handler); }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  emit(type, target = this) { [...(this.listeners.get(type) || [])].forEach(handler => handler({ target })); }
  setAttribute(key, value) { this.attributes[key] = value; }
  getClientRects() { return this.visible ? [{}] : []; }
}
const document = new Element();
document.hidden = false;
document.createElement = () => new Element();
const window = new Element();
const context = vm.createContext({ document, window, performance: { now: () => now }, activeObdTimelinePlaybackStop: null,
  requestAnimationFrame: callback => { frames.set(++serial, callback); return serial; }, cancelAnimationFrame: id => frames.delete(id) });
vm.runInContext(helper, context);
const advance = ms => { now += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
const create = (times = [0, 1000, 4000]) => {
  const slider = new Element(); slider.value = String(times.length - 1);
  const points = times.map(time => ({ capturedAt: time === null ? null : new Date(1700000000000 + time).toISOString(), value: time }));
  const original = JSON.stringify(points);
  let updates = 0;
  const button = context.createObdTimelinePlaybackButton(points, slider, () => { updates += 1; }, "RPM");
  return { slider, button, unchanged: () => JSON.stringify(points) === original, updates: () => updates };
};
const paused = item => item.button.attributes['aria-label'].endsWith('記録を再生');
const clean = () => frames.size === 0 && [...document.listeners.values(), ...window.listeners.values()].every(set => !set.size) && context.activeObdTimelinePlaybackStop === null;
const first = create();
first.button.emit('click');
check(first.slider.value === '0' && frames.size === 1, 'End position must restart from first point');
advance(400); first.button.emit('click');
check(paused(first) && clean(), 'Pause must release frame and listeners');
advance(10000); first.button.emit('click'); advance(599);
check(first.slider.value === '0', 'Resume must preserve partial interval');
advance(1); check(first.slider.value === '1', 'Resume must reach next point at original elapsed time');
advance(3000); check(first.slider.value === '2' && paused(first) && clean(), 'Completion must stop exactly at last point');
check(first.unchanged(), 'Playback must not mutate points');
first.button.emit('click'); first.slider.value = '1'; first.slider.emit('input');
check(paused(first) && clean(), 'Manual position must pause playback');
first.button.emit('click'); advance(2999); check(first.slider.value === '1', 'Manual position must reset elapsed base');
advance(1); check(first.slider.value === '2' && clean(), 'Manual position resume must honor original interval');
for (const times of [[], [0], [0, 0], [1000, 0], [null, 1000], [0, 1800001]]) {
  const invalid = create(times); invalid.button.emit('click');
  check(invalid.button.disabled && clean(), 'Invalid or excessive duration must not start');
}
const second = create(); first.button.emit('click'); second.button.emit('click');
check(paused(first) && !paused(second) && frames.size === 1, 'Only one series may play');
first.slider.value = '1'; first.slider.emit('input');
check(paused(second) && clean(), 'Manual movement in another series must stop active playback');
second.button.emit('click');
document.hidden = true; document.emit('visibilitychange');
check(paused(second) && clean(), 'Hidden document must stop');
second.button.emit('click'); check(clean(), 'Hidden document must not start'); document.hidden = false;
for (const event of ['pagehide', 'toggle', 'click']) {
  second.button.emit('click');
  if (event === 'pagehide') window.emit(event);
  else if (event === 'toggle') document.emit(event, { tagName: 'DETAILS', open: false, contains: () => true });
  else document.emit(event, { closest: () => ({ parentElement: { contains: () => true } }) });
  check(paused(second) && clean(), `${event} must release playback`);
}
for (const property of ['isConnected', 'visible']) {
  second.button.emit('click'); second.button[property] = false; advance(10);
  check(paused(second) && clean(), `${property} loss must stop`); second.button[property] = true;
}
for (const name of ['activateTab', 'renderObdStageView', 'renderObdReadoutDetailSelection', 'renderObdBridgeSessionDetails']) {
  const body = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{([^\\n]*\\r?\\n[^\\n]*)`))?.[1];
  check(body?.includes('activeObdTimelinePlaybackStop()'), `${name} must synchronously stop on entry`);
}
console.log(`Timeline playback checks: ${checks} / Errors: 0`);
