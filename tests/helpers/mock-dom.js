/**
 * Minimalistyczny pomocnik Mock DOM dla środowiska Node.js (node:test).
 * Zero zewnętrznych zależności - eliminuje potrzebę instalowania JSDOM.
 */

class MockClassList {
  constructor(initial = []) {
    this.classes = new Set(initial);
  }
  add(...names) { names.forEach(n => this.classes.add(n)); }
  remove(...names) { names.forEach(n => this.classes.delete(n)); }
  toggle(name) {
    if (this.classes.has(name)) { this.classes.delete(name); return false; }
    this.classes.add(name); return true;
  }
  contains(name) { return this.classes.has(name); }
}

class MockElement {
  constructor(tagName = 'div', attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.classList = new MockClassList(
      attributes.class ? attributes.class.split(/\s+/).filter(Boolean) : []
    );
    this.children = [];
    this.parentElement = null;
    this.listeners = {};
    this.textContent = '';
  }

  setAttribute(name, val) { this.attributes[name] = String(val); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || [];
    for (const h of handlers) h(event);
    return !event.defaultPrevented;
  }
}

module.exports = {
  MockElement,
  MockClassList,
};
