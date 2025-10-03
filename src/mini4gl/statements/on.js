'use strict';

const onWidgetHelpers = (() => {
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
  const module = onWidgetHelpers.getWidgetStateModule();
  if (!module) {
    throw new Error('Widget state helpers are not available');
  }
  return module;
}

function isKeywordToken(tok, keyword) {
  if (!tok) {
    return false;
  }
  if (tok.type === keyword) {
    return true;
  }
  if (tok.type === 'IDENT' && String(tok.value).toUpperCase() === keyword) {
    return true;
  }
  return false;
}

function parseOn(parser) {
  parser.eat('ON');
  const eventExpr = parser.parseExpr();
  if (!isKeywordToken(parser.peek(), 'OF')) {
    throw new SyntaxError('Expected OF after ON event expression');
  }
  parser.eat(parser.peek().type);
  const targetTok = parser.peek();
  if (!targetTok || targetTok.type !== 'IDENT') {
    throw new SyntaxError('Expected widget name after OF');
  }
  const target = parser.eat('IDENT').value;
  if (!isKeywordToken(parser.peek(), 'DO')) {
    throw new SyntaxError('Expected DO after widget name in ON statement');
  }
  parser.eat(parser.peek().type);
  const body = parser.parsePossiblyBlock();
  parser.optionalDot();
  return {
    type: 'OnEvent',
    eventExpr,
    target,
    body
  };
}

function executeOnEvent(node, env, context) {
  const widgetState = getWidgetStateModule();
  const eventValue = widgetState.resolveEventName(node.eventExpr, env, context);
  const trimmed = eventValue.trim();
  if (!trimmed) {
    throw new Error('ON statement requires a non-empty event name');
  }
  widgetState.registerEventHandler(env, node.target, trimmed, {
    body: node.body,
    ownerEnv: env
  });
}

const onStatement = {
  keywords: ['ON'],
  parse: parseOn,
  executors: {
    OnEvent: executeOnEvent
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = onStatement;
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
  globalScope.Mini4GLStatementModules.push(onStatement);
}
