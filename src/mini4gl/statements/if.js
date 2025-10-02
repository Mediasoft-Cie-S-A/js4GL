'use strict';

function parseIf(parser) {
  parser.eat('IF');
  const test = parser.parseExpr();
  parser.eat('THEN');
  const consequent = parser.parsePossiblyBlock();
  let alternate = null;
  if (parser.match('ELSE')) {
    alternate = parser.parsePossiblyBlock();
  }
  return { type: 'If', test, consequent, alternate };
}

async function executeIf(node, env, context) {
  if (context.truthy(context.evalExpr(node.test, env))) {
    await context.execBlock(node.consequent, env);
  } else if (node.alternate) {
    await context.execBlock(node.alternate, env);
  }
}

const ifStatement = {
  keywords: ['IF'],
  parse: parseIf,
  executors: {
    If: executeIf
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ifStatement;
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
  globalScope.Mini4GLStatementModules.push(ifStatement);
}
