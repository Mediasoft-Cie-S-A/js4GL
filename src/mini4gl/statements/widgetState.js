'use strict';

function getRootEnv(env) {
  let current = env;
  while (current && current.parent) {
    current = current.parent;
  }
  return current || env;
}

function normalizeWidgetName(name) {
  return String(name || '').trim().toLowerCase();
}

function ensureWidgetRegistry(env) {
  const root = getRootEnv(env);
  if (!root.widgets) {
    root.widgets = Object.create(null);
  }
  return root.widgets;
}

function ensureWidgetEntry(env, name) {
  const registry = ensureWidgetRegistry(env);
  const key = normalizeWidgetName(name);
  if (!registry[key]) {
    registry[key] = {
      name: key,
      displayName: name,
      type: null,
      defined: false,
      created: false,
      enabled: false,
      visible: false,
      attributes: Object.create(null),
      container: null,
      lastEvent: null,
      noUndo: false
    };
  }
  return registry[key];
}

function defineWidget(env, widgetType, name, options = {}) {
  const entry = ensureWidgetEntry(env, name);
  entry.type = widgetType;
  entry.displayName = name;
  entry.defined = true;
  entry.noUndo = !!options.noUndo;
  if (!entry.attributes) {
    entry.attributes = Object.create(null);
  }
  if (options.attributes) {
    for (const [key, value] of Object.entries(options.attributes)) {
      entry.attributes[key] = value;
    }
  }
  return entry;
}

function createWidget(env, widgetType, name, options = {}) {
  const entry = ensureWidgetEntry(env, name);
  if (widgetType) {
    entry.type = widgetType;
  }
  entry.created = true;
  entry.displayName = name;
  if (options.container) {
    entry.container = { ...options.container };
  }
  if (typeof options.visible === 'boolean') {
    entry.visible = options.visible;
  }
  if (typeof options.enabled === 'boolean') {
    entry.enabled = options.enabled;
  }
  return entry;
}

function setWidgetState(env, name, updates = {}) {
  const entry = ensureWidgetEntry(env, name);
  for (const [key, value] of Object.entries(updates)) {
    entry[key] = value;
  }
  return entry;
}

function ensureEventRegistry(env) {
  const root = getRootEnv(env);
  if (!root.eventHandlers) {
    root.eventHandlers = Object.create(null);
  }
  return root.eventHandlers;
}

function registerEventHandler(env, widgetName, eventName, handler) {
  const registry = ensureEventRegistry(env);
  const widgetKey = normalizeWidgetName(widgetName);
  if (!registry[widgetKey]) {
    registry[widgetKey] = Object.create(null);
  }
  registry[widgetKey][eventName.toUpperCase()] = handler;
}

function getEventHandler(env, widgetName, eventName) {
  const registry = ensureEventRegistry(env);
  const widgetKey = normalizeWidgetName(widgetName);
  const widgetHandlers = registry[widgetKey];
  if (!widgetHandlers) {
    return null;
  }
  return widgetHandlers[eventName.toUpperCase()] || null;
}

async function triggerEvent(env, widgetName, eventName, context) {
  const handler = getEventHandler(env, widgetName, eventName);
  if (!handler) {
    return false;
  }
  const execEnv = handler.ownerEnv && typeof handler.ownerEnv === 'object'
    ? handler.ownerEnv
    : env;
  if (handler.body) {
    await context.execBlock(handler.body, execEnv);
  }
  setWidgetState(env, widgetName, { lastEvent: eventName.toUpperCase() });
  return true;
}

function resolveEventName(eventExpr, env, context) {
  if (!context || typeof context.evalExpr !== 'function') {
    return '';
  }
  let raw = context.evalExpr(eventExpr, env);
  if ((raw == null || String(raw).trim() === '') && eventExpr && eventExpr.type === 'Var') {
    raw = eventExpr.name;
  }
  if (raw == null) {
    return '';
  }
  return String(raw);
}
const exported = {
  getRootEnv,
  normalizeWidgetName,
  ensureWidgetRegistry,
  ensureWidgetEntry,
  defineWidget,
  createWidget,
  setWidgetState,
  registerEventHandler,
  getEventHandler,
  triggerEvent,
  resolveEventName
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  const globalScope =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof window !== 'undefined'
        ? window
        : typeof global !== 'undefined'
          ? global
          : {};
  globalScope.Mini4GLWidgetState = exported;
}
