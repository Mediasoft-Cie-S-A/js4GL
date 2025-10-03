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
