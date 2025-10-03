'use strict';

(function initStatementRegistry(root) {
  const isCommonJS = typeof module !== 'undefined' && module.exports;
  const modules = [];

  if (isCommonJS) {
    modules.push(
      require('./assign'),
      require('./define'),
      require('./procedure'),
      require('./run'),
      require('./createWidget'),
      require('./enable'),
      require('./view'),
      require('./apply'),
      require('./on'),
      require('./waitFor'),
      require('./display'),
      require('./input'),
      require('./if'),
      require('./do'),
      require('./repeat'),
      require('./while'),
      require('./forEach'),
      require('./find')
    );
  } else {
    const globalModules = root.Mini4GLStatementModules || [];
    modules.push(...globalModules);
  }

  const keywordMap = Object.create(null);
  const identifierParsers = [];
  const executors = Object.create(null);

  for (const mod of modules) {
    if (!mod) continue;
    if (Array.isArray(mod.keywords)) {
      for (const keyword of mod.keywords) {
        keywordMap[keyword] = mod;
      }
    }
    if (mod.allowIdentifierStart) {
      identifierParsers.push(mod);
    }
    if (mod.executors) {
      for (const [type, fn] of Object.entries(mod.executors)) {
        executors[type] = fn;
      }
    }
  }

  const exported = {
    keywordMap,
    identifierParsers,
    executors
  };

  if (isCommonJS) {
    module.exports = exported;
  } else {
    root.Mini4GLStatementRegistry = exported;
  }
})(typeof globalThis !== 'undefined'
  ? globalThis
  : typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
      ? global
      : this);
