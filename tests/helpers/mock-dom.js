/**
 * Minimalistyczny pomocnik Mock DOM dla środowiska Node.js (node:test).
 * Zero zewnętrznych zależności - eliminuje potrzebę instalowania JSDOM.
 */

class MockClassList {
  constructor(initial = []) {
    this._set = new Set(Array.isArray(initial) ? initial : []);
  }
  add(...tokens) {
    tokens.forEach((t) => this._set.add(t));
  }
  remove(...tokens) {
    tokens.forEach((t) => this._set.delete(t));
  }
  toggle(token, force) {
    if (force !== undefined) {
      if (force) {
        this._set.add(token);
        return true;
      }
      this._set.delete(token);
      return false;
    }
    if (this._set.has(token)) {
      this._set.delete(token);
      return false;
    }
    this._set.add(token);
    return true;
  }
  contains(token) {
    return this._set.has(token);
  }
  get classes() {
    return this._set;
  }
}

class MockElement {
  constructor(tagName = 'div', attributes = {}) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.attributes = { ...attributes };
    this.classList = new MockClassList(
      attributes.class ? String(attributes.class).split(/\s+/).filter(Boolean) : []
    );
    this.children = [];
    this.parentElement = null;
    this.listeners = {};
    this._listeners = this.listeners;
    this.textContent = '';
    this._innerHTML = '';
    this.style = {};
    this.dataset = {};
    this.value = '';
    this.disabled = false;
    this.scrollTop = 0;
    this.scrollHeight = 100;
    this.focused = false;
  }

  get id() {
    return this.attributes.id || '';
  }
  set id(val) {
    this.attributes.id = String(val);
  }

  get className() {
    return Array.from(this.classList._set).join(' ');
  }
  set className(val) {
    this.classList = new MockClassList(String(val || '').split(/\s+/).filter(Boolean));
  }

  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(html) {
    this._innerHTML = String(html || '');
    this.children = [];
    if (!this._innerHTML.trim()) return;

    const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9-]+)([^>]*?)\s*\/?>/g;
    let match;
    while ((match = tagRegex.exec(this._innerHTML)) !== null) {
      const tag = match[1] || match[4];
      const attrStr = match[2] || match[5] || '';
      const inner = match[3] || '';
      const child = new MockElement(tag);
      const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/g;
      let am;
      while ((am = attrRegex.exec(attrStr)) !== null) {
        child.setAttribute(am[1], am[2]);
      }
      if (inner && /<[a-zA-Z]/.test(inner)) {
        child.innerHTML = inner;
      } else {
        child.textContent = inner.replace(/<[^>]+>/g, '');
      }
      this.appendChild(child);
    }
  }

  setAttribute(name, value) {
    const strVal = String(value);
    this.attributes[name] = strVal;
    if (name === 'class') {
      this.className = strVal;
    } else if (name.startsWith('data-')) {
      const camel = name
        .slice(5)
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[camel] = strVal;
    }
  }

  getAttribute(name) {
    if (name === 'class') return this.className;
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  appendChild(child) {
    if (child && typeof child === 'object') {
      child.parentElement = this;
      this.children.push(child);
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
      this.parentElement = null;
    }
  }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }

  dispatchEvent(evt) {
    const e = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      target: this,
      currentTarget: this,
      ...evt
    };
    const list = this.listeners[e.type] || [];
    list.forEach((fn) => fn.call(this, e));
    return !e.defaultPrevented;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  focus() {
    this.focused = true;
    if (this._ownerDocument) {
      this._ownerDocument.activeElement = this;
    }
  }

  matches(selector) {
    const s = String(selector || '').trim();
    if (!s) return false;
    if (s.startsWith('#')) return this.id === s.slice(1);
    if (s.startsWith('.')) return this.classList.contains(s.slice(1));
    const attrMatch = s.match(/^([a-zA-Z0-9_-]+)?\[([a-zA-Z0-9_-]+)(?:([*^$]?=)"([^"]*)")?\]$/);
    if (attrMatch) {
      const [, tagPart, attrName, op, attrVal] = attrMatch;
      if (tagPart && this.tagName !== tagPart.toUpperCase()) return false;
      const val = this.getAttribute(attrName);
      if (val === null) return false;
      if (!op) return true;
      if (op === '=') return val === attrVal;
      if (op === '*=') return val.includes(attrVal);
      if (op === '^=') return val.startsWith(attrVal);
      if (op === '$=') return val.endsWith(attrVal);
    }
    if (s.includes('.')) {
      const [tag, cls] = s.split('.');
      return (!tag || this.tagName === tag.toUpperCase()) && this.classList.contains(cls);
    }
    return this.tagName === s.toUpperCase();
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.matches && child.matches(selector)) {
          results.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return results;
  }
}

function createStorage() {
  const store = new Map();
  return {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(String(k), String(v));
    },
    removeItem(k) {
      store.delete(k);
    },
    clear() {
      store.clear();
    }
  };
}

function setupMockDom(html = '') {
  const docListeners = {};
  const winListeners = {};
  const head = new MockElement('head');
  const body = new MockElement('body');

  const document = {
    readyState: 'complete',
    activeElement: null,
    head,
    body,
    createElement(tag) {
      const el = new MockElement(tag);
      el._ownerDocument = document;
      return el;
    },
    getElementById(id) {
      return head.querySelector(`#${id}`) || body.querySelector(`#${id}`);
    },
    querySelector(sel) {
      if (sel === 'body') return body;
      if (sel === 'head') return head;
      return head.querySelector(sel) || body.querySelector(sel);
    },
    querySelectorAll(sel) {
      return [...head.querySelectorAll(sel), ...body.querySelectorAll(sel)];
    },
    addEventListener(type, fn) {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    dispatchEvent(evt) {
      const list = docListeners[evt.type] || [];
      list.forEach((fn) => fn(evt));
    }
  };

  head._ownerDocument = document;
  body._ownerDocument = document;
  if (html) {
    body.innerHTML = html;
  }

  const defaultForbiddenFetch = async (url) => {
    throw new Error(`NETWORK_FORBIDDEN: Zablokowano niezamockowane wywołanie sieciowe fetch(${String(url)}) w teście jednostkowym`);
  };

  const window = {
    document,
    location: { hostname: 'localhost', pathname: '/' },
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    performance: { now: () => Date.now() },
    fetch: defaultForbiddenFetch,
    addEventListener(type, fn) {
      if (!winListeners[type]) winListeners[type] = [];
      winListeners[type].push(fn);
    },
    dispatchEvent(evt) {
      const list = winListeners[evt.type] || [];
      list.forEach((fn) => fn(evt));
    }
  };

  globalThis.fetch = defaultForbiddenFetch;

  return { document, window };
}

module.exports = {
  MockElement,
  MockClassList,
  setupMockDom
};
