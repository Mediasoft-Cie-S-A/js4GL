'use strict';

function parseWhile(parser) {
  parser.eat('WHILE');
  const test = parser.parseExpr();
  parser.eat('DO');
  parser.match('COLON');
  const body = parser.parseBlockStatements();
  parser.eat('END');
  parser.optionalDot();
  return { type: 'While', test, body };
}

async function executeWhile(node, env, context) {
  while (context.truthy(context.evalExpr(node.test, env))) {
    await context.execBlock({ type: 'Block', body: node.body }, env);
  }
}

const exported = {
  keywords: ['WHILE'],
  parse: parseWhile,
  executors: {
    While: executeWhile
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
