(function exposeMobileState(root) {
  'use strict';

  class ActionInput {
    constructor() {
      this.sources = new Map();
      this.held = new Set();
      this.pressed = new Set();
      this.released = new Set();
    }

    press(source, action) {
      if (this.sources.get(source) === action) return;
      this.release(source);
      this.sources.set(source, action);
      if (!this.held.has(action)) this.pressed.add(action);
      this.held.add(action);
    }

    release(source) {
      const action = this.sources.get(source);
      if (!action) return;
      this.sources.delete(source);
      if (![...this.sources.values()].includes(action)) {
        this.held.delete(action);
        this.released.add(action);
      }
    }

    consume() {
      const input = {
        left: this.held.has('left'),
        right: this.held.has('right'),
        jumpPressed: this.pressed.has('jump'),
        jumpReleased: this.released.has('jump'),
        interactPressed: this.pressed.has('interact')
      };
      this.pressed.clear();
      this.released.clear();
      return [input];
    }

    clear() {
      this.sources.clear();
      this.held.clear();
      this.pressed.clear();
      this.released.clear();
    }
  }

  function sanitizeProgress(saved, levels) {
    const records = {};
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return records;
    for (let index = 0; index < levels.length; index += 1) {
      const record = saved[index];
      if (!record || !Number.isFinite(record.time) || record.time <= 0 || !Number.isInteger(record.gems) || record.gems < 0) break;
      records[index] = { time: record.time, gems: Math.min(record.gems, levels[index].gems.length) };
    }
    return records;
  }

  function getUnlockedLevel(records, levelCount) {
    let unlocked = 0;
    while (unlocked < levelCount - 1 && records[unlocked]) unlocked += 1;
    return unlocked;
  }

  const mobileState = { ActionInput, sanitizeProgress, getUnlockedLevel };
  if (typeof module !== 'undefined' && module.exports) module.exports = mobileState;
  else root.SproutMobile = mobileState;
})(typeof globalThis !== 'undefined' ? globalThis : this);
