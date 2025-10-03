'use strict';

const applyWidgetHelpers = (() => {
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
  const module = applyWidgetHelpers.getWidgetStateModule();
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

function parseApply(parser) {
  parser.eat('APPLY');
  const eventExpr = parser.parseExpr();
  const next = parser.peek();
  if (!isKeywordToken(next, 'TO')) {
    throw new SyntaxError('Expected TO after APPLY event expression');
  }
  parser.eat(next.type);
  const targetTok = parser.peek();
  if (!targetTok || targetTok.type !== 'IDENT') {
    throw new SyntaxError('Expected widget name after TO');
  }
  const target = parser.eat('IDENT').value;
  parser.optionalDot();
  return {
    type: 'ApplyEvent',
    eventExpr,
    target
  };
}

async function executeApplyEvent(node, env, context) {
  const widgetState = getWidgetStateModule();
  const eventValue = widgetState.resolveEventName(node.eventExpr, env, context);
  const trimmed = eventValue.trim();
  if (!trimmed) {
    throw new Error('APPLY requires a non-empty event name');
  }
  const normalized = trimmed.toUpperCase();
  const handled = await widgetState.triggerEvent(env, node.target, normalized, context);
  if (!handled) {
    widgetState.setWidgetState(env, node.target, { lastEvent: normalized });
  }
}

const applyStatement = {
  keywords: ['APPLY'],
  parse: parseApply,
  executors: {
    ApplyEvent: executeApplyEvent
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = applyStatement;
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
  globalScope.Mini4GLStatementModules.push(applyStatement);
}
