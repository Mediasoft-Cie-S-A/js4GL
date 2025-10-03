'use strict';

const createWidgetHelpers = (() => {
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
  const module = createWidgetHelpers.getWidgetTypesModule();
  if (!module) {
    throw new Error('Widget helper modules are not available');
  }
  return module;
}

function getWidgetStateModule() {
  const module = createWidgetHelpers.getWidgetStateModule();
  if (!module) {
    throw new Error('Widget helper modules are not available');
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

function parseCreate(parser) {
  const { readWidgetType } = getWidgetTypesModule();
  parser.eat('CREATE');
  const widgetType = readWidgetType(parser);
  const nameTok = parser.peek();
  if (!nameTok || nameTok.type !== 'IDENT') {
    throw new SyntaxError(`Expected widget name after ${widgetType}`);
  }
  const name = parser.eat('IDENT').value;

  let container = null;
  if (isKeywordToken(parser.peek(), 'IN')) {
    parser.eat(parser.peek().type);
    let containerType = null;
    const typeTok = parser.peek();
    if (isKeywordToken(typeTok, 'FRAME')) {
      containerType = 'FRAME';
      parser.eat(typeTok.type);
    }
    const containerNameTok = parser.peek();
    if (!containerNameTok || containerNameTok.type !== 'IDENT') {
      throw new SyntaxError('Expected container name after IN');
    }
    const containerName = parser.eat('IDENT').value;
    container = {
      type: containerType || 'UNKNOWN',
      name: containerName
    };
  }

  parser.optionalDot();
  return {
    type: 'CreateWidget',
    widgetType,
    name,
    container
  };
}

function executeCreateWidget(node, env) {
  const widgetState = getWidgetStateModule();
  widgetState.createWidget(env, node.widgetType, node.name, {
    container: node.container || null
  });
}

const createWidgetStatement = {
  keywords: ['CREATE'],
  parse: parseCreate,
  executors: {
    CreateWidget: executeCreateWidget
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = createWidgetStatement;
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
  globalScope.Mini4GLStatementModules.push(createWidgetStatement);
}
