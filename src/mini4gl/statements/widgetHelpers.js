'use strict';

let cachedTypesModule = null;
let cachedStateModule = null;

function resolveGlobalScope() {
  if (typeof globalThis !== 'undefined') {
    return globalThis;
  }
  if (typeof window !== 'undefined') {
    return window;
  }
  if (typeof global !== 'undefined') {
    return global;
  }
  return {};
}

function tryRequire(path) {
  if (typeof require !== 'function') {
    return null;
  }
  try {
    return require(path);
  } catch (error) {
    return null;
  }
}

function getWidgetTypesModule() {
  if (!cachedTypesModule) {
    cachedTypesModule = tryRequire('./widgetTypes');
    if (!cachedTypesModule) {
      const scope = resolveGlobalScope();
      cachedTypesModule = scope.Mini4GLWidgetTypes || null;
    }
    if (!cachedTypesModule) {
      throw new Error('Widget helper modules are not available');
    }
  }
  return cachedTypesModule;
}

function getWidgetStateModule() {
  if (!cachedStateModule) {
    cachedStateModule = tryRequire('./widgetState');
    if (!cachedStateModule) {
      const scope = resolveGlobalScope();
      cachedStateModule = scope.Mini4GLWidgetState || null;
    }
    if (!cachedStateModule) {
      throw new Error('Widget helper modules are not available');
    }
  }
  return cachedStateModule;
}

function ensureWidgetHelpers() {
  return {
    widgetTypes: getWidgetTypesModule(),
    widgetState: getWidgetStateModule()
  };
}

const exported = {
  getWidgetTypesModule,
  getWidgetStateModule,
  ensureWidgetHelpers
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  const scope = resolveGlobalScope();
  scope.Mini4GLWidgetHelpers = exported;
}
