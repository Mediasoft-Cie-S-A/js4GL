'use strict';

function parseRepeat(parser) {
  parser.eat('REPEAT');
  let whileExpr = null;
  if (parser.match('WHILE')) {
    whileExpr = parser.parseExpr();
  }
  parser.match('COLON');
  const body = parser.parseBlockStatements();
  parser.eat('END');
  parser.optionalDot();
  return { type: 'Repeat', whileExpr, body };
}

async function executeRepeat(node, env, context) {
  if (!node.whileExpr) {
    throw new Error('REPEAT without WHILE not supported in this mini-interpreter');
  }
  while (context.truthy(context.evalExpr(node.whileExpr, env))) {
    await context.execBlock({ type: 'Block', body: node.body }, env);
  }
}

const repeatStatement = {
  keywords: ['REPEAT'],
  parse: parseRepeat,
  executors: {
    Repeat: executeRepeat
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = repeatStatement;
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
  globalScope.Mini4GLStatementModules.push(repeatStatement);
}
