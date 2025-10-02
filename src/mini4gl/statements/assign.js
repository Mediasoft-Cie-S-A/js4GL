'use strict';

function parseAssign(parser) {
  parser.match('ASSIGN');
  const id = parser.eat('IDENT').value;
  const assignTok = parser.eat('OP');
  if (assignTok.value !== '=') {
    throw new SyntaxError(`Expected '=' but got ${assignTok.value}`);
  }
  const value = parser.parseExpr();
  parser.optionalDot();
  return { type: 'Assign', id: id.toLowerCase(), value };
}

function executeAssign(node, env, context) {
  context.setVar(env, node.id, context.evalExpr(node.value, env));
}

const exported = {
  keywords: ['ASSIGN'],
  allowIdentifierStart: true,
  parse: parseAssign,
  executors: {
    Assign: executeAssign
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
