'use strict';

function parseDefine(parser) {
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
  throw new SyntaxError('Unsupported DEFINE form');
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

const exported = {
  keywords: ['DEFINE'],
  parse: parseDefine,
  executors: {
    DefineVariable: executeDefineVariable,
    DefineParameter: executeDefineParameter
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
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
  globalScope.Mini4GLStatementModules.push(exported);
}
