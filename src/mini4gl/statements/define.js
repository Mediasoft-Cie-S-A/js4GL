'use strict';

const defineWidgetHelpers = (() => {
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
    getWidgetTypesModule: () => scope.Mini4GLWidgetTypes || null,
    getWidgetStateModule: () => scope.Mini4GLWidgetState || null
  };
})();

function getWidgetTypesModule() {
  const module = defineWidgetHelpers.getWidgetTypesModule();
  if (!module) {
    throw new Error('Widget helper modules are not available');
  }
  return module;
}

function getWidgetStateModule() {
  const module = defineWidgetHelpers.getWidgetStateModule();
  if (!module) {
    throw new Error('Widget helper modules are not available');
  }
  return module;
}

const SIMPLE_WIDGET_ATTRIBUTES = new Set(['LABEL', 'FORMAT', 'TITLE', 'TEXT', 'TOOLTIP', 'HELP']);

function isTokenKeyword(tok, keyword) {
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

function tokenText(tok) {
  if (!tok) {
    return '';
  }
  if (tok.type === 'IDENT') {
    return String(tok.value).toUpperCase();
  }
  return tok.type;
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

function parseWidgetTail(parser) {
  const attributes = [];
  let noUndo = false;
  let encounteredUnsupported = false;
  while (true) {
    const next = parser.peek();
    if (!next || next.type === 'DOT' || next.type === 'EOF') {
      break;
    }
    if (isTokenKeyword(next, 'NO')) {
      parser.eat(next.type);
      const dash = parser.peek();
      if (dash && dash.type === 'OP' && dash.value === '-') {
        parser.eat('OP');
      }
      const undoTok = parser.peek();
      if (!isTokenKeyword(undoTok, 'UNDO')) {
        encounteredUnsupported = true;
        break;
      }
      parser.eat(undoTok.type);
      noUndo = true;
      continue;
    }
    const attrName = tokenText(next);
    if (SIMPLE_WIDGET_ATTRIBUTES.has(attrName)) {
      parser.eat(next.type);
      const expr = parser.parseExpr();
      attributes.push({ name: attrName, expr });
      continue;
    }
    if (next.type === 'WITH') {
      encounteredUnsupported = true;
      break;
    }
    encounteredUnsupported = true;
    break;
  }
  if (encounteredUnsupported) {
    skipToStatementEnd(parser);
  }
  return { attributes, noUndo };
}

function parseWidgetDefinition(parser, widgetType) {
  const nameTok = parser.peek();
  if (!nameTok || nameTok.type !== 'IDENT') {
    throw new SyntaxError(`Expected widget name after ${widgetType}`);
  }
  const name = parser.eat('IDENT').value;
  const { attributes, noUndo } = parseWidgetTail(parser);
  parser.optionalDot();
  return {
    type: 'DefineWidget',
    widgetType,
    name,
    attributes,
    noUndo
  };
}

function parseDefine(parser) {
  const { readWidgetType } = getWidgetTypesModule();
  parser.eat('DEFINE');
  const next = parser.peek();
  if (next.type === 'VARIABLE') {
    parser.eat('VARIABLE');
    const details = parseDefineDetails(parser);
    parser.optionalDot();
    return { type: 'DefineVariable', ...details };
  }
  if (next.type === 'INPUT' || next.type === 'OUTPUT') {
    const mode = parser.eat(next.type).type;
    parser.eat('PARAMETER');
    const details = parseDefineDetails(parser);
    parser.optionalDot();
    return { type: 'DefineParameter', mode, ...details };
  }
  const widgetType = readWidgetType(parser);
  return parseWidgetDefinition(parser, widgetType);
}

function parseDefineDetails(parser) {
  const id = parser.eat('IDENT').value;
  let dataType = null;
  if (parser.match('AS')) {
    const typeTok = parser.peek();
    if (typeTok.type === 'IDENT') {
      dataType = parser.eat('IDENT').value.toUpperCase();
    } else {
      const consumed = parser.eat(typeTok.type);
      const raw = consumed.value || consumed.type;
      dataType = String(raw).toUpperCase();
    }
  }
  let init = null;
  let noUndo = false;
  while (true) {
    const next = parser.peek();
    if (next.type === 'INIT') {
      parser.eat('INIT');
      if (parser.peek().type === 'OP' && parser.peek().value === '=') {
        parser.eat('OP');
      }
      init = parser.parseExpr();
      continue;
    }
    if (next.type === 'NO') {
      parser.eat('NO');
      if (parser.peek().type === 'OP' && parser.peek().value === '-') {
        parser.eat('OP');
      }
      const undoTok = parser.peek();
      if (undoTok.type === 'UNDO' || (undoTok.type === 'IDENT' && undoTok.value.toUpperCase() === 'UNDO')) {
        parser.eat(undoTok.type);
      }
      noUndo = true;
      continue;
    }
    break;
  }
  return { id: id.toLowerCase(), dataType, init, noUndo };
}

function executeDefineVariable(node, env, context) {
  const value = node.init ? context.evalExpr(node.init, env) : context.initialValueForType(node.dataType);
  env.vars[node.id] = value;
  if (env.varDefs) {
    env.varDefs[node.id] = { dataType: node.dataType, noUndo: node.noUndo };
  }
}

function executeDefineParameter() {
  // Parameters are handled at procedure invocation time.
}

function executeDefineWidget(node, env, context) {
  const widgetState = getWidgetStateModule();
  const computedAttributes = Object.create(null);
  for (const attribute of node.attributes) {
    computedAttributes[attribute.name] = context.evalExpr(attribute.expr, env);
  }
  const entry = widgetState.defineWidget(env, node.widgetType, node.name, {
    attributes: computedAttributes,
    noUndo: node.noUndo
  });
  const varName = node.name.toLowerCase();
  env.vars[varName] = entry;
  if (env.varDefs) {
    env.varDefs[varName] = {
      dataType: node.widgetType,
      isWidget: true,
      noUndo: node.noUndo
    };
  }
}

const defineStatement = {
  keywords: ['DEFINE'],
  parse: parseDefine,
  executors: {
    DefineVariable: executeDefineVariable,
    DefineParameter: executeDefineParameter,
    DefineWidget: executeDefineWidget
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = defineStatement;
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
  globalScope.Mini4GLStatementModules.push(defineStatement);
}
