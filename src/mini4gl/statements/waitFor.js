'use strict';

const waitForWidgetHelpers = (() => {
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
  const module = waitForWidgetHelpers.getWidgetStateModule();
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

function consumeHyphen(parser) {
  const tok = parser.peek();
  if (tok && tok.type === 'OP' && tok.value === '-') {
    parser.eat('OP');
  }
}

function parseWaitFor(parser) {
  parser.eat('WAIT');
  consumeHyphen(parser);
  if (!isKeywordToken(parser.peek(), 'FOR')) {
    throw new SyntaxError('Expected FOR after WAIT');
  }
  parser.eat(parser.peek().type);
  const eventExpr = parser.parseExpr();
  let target = null;
  if (isKeywordToken(parser.peek(), 'OF')) {
    parser.eat(parser.peek().type);
    if (isKeywordToken(parser.peek(), 'FRAME')) {
      parser.eat(parser.peek().type);
    }
    const targetTok = parser.peek();
    if (!targetTok || targetTok.type !== 'IDENT') {
      throw new SyntaxError('Expected widget name after OF');
    }
    target = parser.eat('IDENT').value;
  }
  parser.optionalDot();
  return {
    type: 'WaitForEvent',
    eventExpr,
    target
  };
}

async function executeWaitFor(node, env, context) {
  const widgetState = getWidgetStateModule();
  const eventValue = widgetState.resolveEventName(node.eventExpr, env, context);
  const trimmed = eventValue.trim();
  if (!trimmed) {
    throw new Error('WAIT-FOR requires a non-empty event name');
  }
  if (!node.target) {
    throw new Error('WAIT-FOR in this runtime requires an explicit widget target');
  }
  const normalized = trimmed.toUpperCase();
  const handled = await widgetState.triggerEvent(env, node.target, normalized, context);
  if (!handled) {
    widgetState.setWidgetState(env, node.target, { lastEvent: normalized });
  }
}

const waitForStatement = {
  keywords: ['WAIT'],
  parse: parseWaitFor,
  executors: {
    WaitForEvent: executeWaitFor
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = waitForStatement;
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
  globalScope.Mini4GLStatementModules.push(waitForStatement);
}
