'use strict';

const widgetStateModule = typeof require === 'function'
  ? require('./widgetState')
  : (typeof globalThis !== 'undefined'
      ? globalThis.Mini4GLWidgetState
      : typeof window !== 'undefined'
        ? window.Mini4GLWidgetState
        : typeof global !== 'undefined'
          ? global.Mini4GLWidgetState
          : null);

if (!widgetStateModule) {
  throw new Error('Widget state helpers are not available');
}

const widgetState = widgetStateModule;

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
