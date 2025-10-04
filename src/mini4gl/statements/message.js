'use strict';

function isExprStartToken(tok) {
  if (!tok) return false;
  if (['IDENT', 'NUMBER', 'STRING', 'UNKNOWN', 'LPAREN'].includes(tok.type)) {
    return true;
  }
  if (tok.type === 'OP' && (tok.value === '+' || tok.value === '-')) {
    return true;
  }
  if (tok.type === 'NOT') {
    return true;
  }
  return false;
}

function tokenIsKeyword(tok, keyword) {
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

function parseHyphenatedIdentifier(parser, stopKeywords = new Set()) {
  const parts = [];
  while (true) {
    const next = parser.peek();
    if (!next || next.type === 'DOT' || next.type === 'EOF') {
      break;
    }
    const upperValue = next.type === 'IDENT' ? String(next.value).toUpperCase() : next.type;
    if (stopKeywords.has(upperValue)) {
      break;
    }
    if (next.type === 'IDENT') {
      parts.push(String(parser.eat('IDENT').value || '').toUpperCase());
      const maybeDash = parser.peek();
      if (maybeDash && maybeDash.type === 'OP' && maybeDash.value === '-') {
        parser.eat('OP');
        continue;
      }
      continue;
    }
    break;
  }
  return parts.length ? parts.join('-') : null;
}

function skipToStatementEnd(parser) {
  while (true) {
    const next = parser.peek();
    if (!next || next.type === 'DOT' || next.type === 'EOF') {
      break;
    }
    parser.eat(next.type);
  }
}

function parseMessage(parser) {
  parser.eat('MESSAGE');
  const parts = [];
  while (true) {
    parts.push(parser.parseExpr());
    if (parser.match('COMMA')) {
      continue;
    }
    const next = parser.peek();
    if (isExprStartToken(next)) {
      continue;
    }
    break;
  }

  let viewAs = null;
  let viewOptions = null;
  if (parser.peek().type === 'VIEW') {
    parser.eat('VIEW');
    const dash = parser.peek();
    if (dash && dash.type === 'OP' && dash.value === '-') {
      parser.eat('OP');
    }
    parser.eat('AS');
    viewAs = parseHyphenatedIdentifier(parser, new Set(['TITLE']));
    if (!viewAs) {
      skipToStatementEnd(parser);
    } else {
      while (true) {
        const next = parser.peek();
        if (!next || next.type === 'DOT' || next.type === 'EOF') {
          break;
        }
        if (tokenIsKeyword(next, 'TITLE')) {
          parser.eat(next.type);
          const titleExpr = parser.parseExpr();
          viewOptions = viewOptions || {};
          viewOptions.title = titleExpr;
          continue;
        }
        skipToStatementEnd(parser);
        break;
      }
    }
  }

  parser.optionalDot();
  return {
    type: 'Message',
    parts,
    viewAs,
    viewOptions
  };
}

function coerceToString(value) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return '';
  }
  try {
    return String(value);
  } catch (_) {
    return '';
  }
}

function buildMessageText(node, env, context) {
  const parts = node.parts.map((expr) => coerceToString(context.evalExpr(expr, env)));
  const base = parts.join(' ').trim();
  if (!node.viewOptions || !node.viewOptions.title) {
    return base;
  }
  const titleValue = context.evalExpr(node.viewOptions.title, env);
  const titleText = coerceToString(titleValue).trim();
  if (!titleText) {
    return base;
  }
  return titleText.length ? `${titleText}: ${base}`.trim() : base;
}

function executeMessage(node, env, context) {
  const text = buildMessageText(node, env, context);
  if (node.viewAs && node.viewAs.toUpperCase() === 'ALERT-BOX') {
    const scope = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : null;
    if (scope && typeof scope.alert === 'function') {
      try {
        scope.alert(text);
      } catch (_) {
        // Ignore alert failures (e.g., security restrictions).
      }
    }
  }
  if (env && typeof env.output === 'function') {
    env.output(text);
  }
}

const messageStatement = {
  keywords: ['MESSAGE'],
  parse: parseMessage,
  executors: {
    Message: executeMessage
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = messageStatement;
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
  globalScope.Mini4GLStatementModules.push(messageStatement);
}
