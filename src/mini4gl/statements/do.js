'use strict';

function parseDo(parser) {
  parser.eat('DO');
  let whileExpr = null;
  if (parser.match('WHILE')) {
    whileExpr = parser.parseExpr();
  }
  parser.match('COLON');
  const body = parser.parseBlockStatements();
  parser.eat('END');
  parser.optionalDot();
  return { type: 'Do', whileExpr, body };
}

async function executeDo(node, env, context) {
  if (node.whileExpr) {
    while (context.truthy(context.evalExpr(node.whileExpr, env))) {
      await context.execBlock({ type: 'Block', body: node.body }, env);
    }
  } else {
    await context.execBlock({ type: 'Block', body: node.body }, env);
  }
}

const doStatement = {
  keywords: ['DO'],
  parse: parseDo,
  executors: {
    Do: executeDo
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = doStatement;
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
  globalScope.Mini4GLStatementModules.push(doStatement);
}
