'use strict';

const enableWidgetHelpers = (() => {
  if (typeof require === 'function') {
    try {
      return require('./widgetHelpers');
    } catch (error) {
      // Ignore and fall back to globals.
    }
  }
  const scope =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof window !== 'undefined'
        ? window
        : typeof global !== 'undefined'
          ? global
          : {};
  return {
    getWidgetStateModule: () => scope.Mini4GLWidgetState || null
  };
})();

function getWidgetStateModule() {
  const module = enableWidgetHelpers.getWidgetStateModule();
  if (!module) {
    throw new Error('Widget state helpers are not available');
  }
  return module;
}

function parseEnable(parser) {
  parser.eat('ENABLE');
  const targets = [];
  while (true) {
    const next = parser.peek();
    if (!next || next.type === 'DOT' || next.type === 'EOF') {
      break;
    }
    if (next.type === 'IDENT') {
      targets.push(parser.eat('IDENT').value);
      if (parser.match('COMMA')) {
        continue;
      }
      continue;
    }
    break;
  }
  if (targets.length === 0) {
    throw new SyntaxError('ENABLE requires at least one widget name');
  }
  parser.optionalDot();
  return {
    type: 'EnableWidgets',
    targets
  };
}

function executeEnableWidgets(node, env) {
  const widgetState = getWidgetStateModule();
  for (const name of node.targets) {
    widgetState.setWidgetState(env, name, { enabled: true, visible: true });
  }
}

const enableStatement = {
  keywords: ['ENABLE'],
  parse: parseEnable,
  executors: {
    EnableWidgets: executeEnableWidgets
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = enableStatement;
} else {
  const globalScope =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof window !== 'undefined'
        ? window
        : typeof global !== 'undefined'
          ? global
          : {};
  globalScope.Mini4GLStatementModules = globalScope.Mini4GLStatementModules || [];
  globalScope.Mini4GLStatementModules.push(enableStatement);
}
