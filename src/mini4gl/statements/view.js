'use strict';

const viewWidgetHelpers = (() => {
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
  const module = viewWidgetHelpers.getWidgetStateModule();
  if (!module) {
    throw new Error('Widget state helpers are not available');
  }
  return module;
}

function parseView(parser) {
  parser.eat('VIEW');
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
    throw new SyntaxError('VIEW requires at least one widget name');
  }
  parser.optionalDot();
  return {
    type: 'ViewWidgets',
    targets
  };
}

function executeViewWidgets(node, env) {
  const widgetState = getWidgetStateModule();
  for (const name of node.targets) {
    widgetState.setWidgetState(env, name, { visible: true });
  }
}

const viewStatement = {
  keywords: ['VIEW'],
  parse: parseView,
  executors: {
    ViewWidgets: executeViewWidgets
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = viewStatement;
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
  globalScope.Mini4GLStatementModules.push(viewStatement);
}
