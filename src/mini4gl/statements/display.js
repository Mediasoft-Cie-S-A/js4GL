'use strict';

function isExprStartToken(tok) {
  if (!tok) return false;
  if (['IDENT', 'NUMBER', 'STRING', 'UNKNOWN', 'LPAREN'].includes(tok.type)) return true;
  if (tok.type === 'OP' && (tok.value === '+' || tok.value === '-')) return true;
  if (tok.type === 'NOT') return true;
  return false;
}

function parseDisplay(parser) {
  const keyword = parser.peek().type;
  parser.eat(keyword);
  const items = [];
  while (true) {
    const expr = parser.parseExpr();
    const meta = { expr };
    while (true) {
      const next = parser.peek();
      if (next.type === 'LABEL') {
        parser.eat('LABEL');
        meta.label = parser.parseExpr();
        continue;
      }
      if (next.type === 'FORMAT') {
        parser.eat('FORMAT');
        meta.format = parser.parseExpr();
        continue;
      }
      break;
    }
    items.push(meta);
    if (parser.match('COMMA')) {
      continue;
    }
    const next = parser.peek();
    if (isExprStartToken(next)) {
      continue;
    }
    break;
  }
  const withOptions = [];
  if (parser.match('WITH')) {
    while (true) {
      const next = parser.peek();
      if (next.type === 'CENTERED') {
        parser.eat('CENTERED');
        withOptions.push('CENTERED');
      } else if (next.type === 'IDENT') {
        withOptions.push(parser.eat('IDENT').value.toUpperCase());
      } else {
        break;
      }
      if (!parser.match('COMMA')) {
        break;
      }
    }
  }
  parser.optionalDot();
  return { type: 'Display', items, withOptions };
}

function executeDisplay(node, env, context) {
  const parts = node.items.map((item) => {
    const value = context.evalExpr(item.expr, env);
    const formatted = context.formatDisplayValue(
      value,
      item.format ? context.evalExpr(item.format, env) : null
    );
    if (item.label) {
      const labelVal = context.evalExpr(item.label, env);
      const labelStr = labelVal == null ? '' : String(labelVal);
      if (labelStr.length) {
        return `${labelStr} ${formatted}`.trim();
      }
    }
    return formatted;
  });
  let line = parts.join(' ');
  if (node.withOptions && node.withOptions.some((opt) => String(opt).toUpperCase() === 'CENTERED')) {
    line = context.centerLine(line);
  }
  env.output(line);
}

const displayStatement = {
  keywords: ['DISPLAY', 'PRINT'],
  parse: parseDisplay,
  executors: {
    Display: executeDisplay
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = displayStatement;
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
  globalScope.Mini4GLStatementModules.push(displayStatement);
}
