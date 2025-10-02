'use strict';

function parseRun(parser) {
  parser.eat('RUN');
  const name = parser.eat('IDENT').value.toLowerCase();
  const args = [];
  if (parser.match('LPAREN')) {
    if (parser.peek().type !== 'RPAREN') {
      while (true) {
        let mode = null;
        const modeTok = parser.peek();
        if (modeTok.type === 'INPUT' || modeTok.type === 'OUTPUT') {
          mode = parser.eat(modeTok.type).type;
        }
        const expr = parser.parseExpr();
        args.push({ mode: mode || null, expr });
        if (!parser.match('COMMA')) {
          break;
        }
      }
    }
    parser.eat('RPAREN');
  }
  parser.optionalDot();
  return { type: 'Run', name, args };
}

function executeRun(node, env, context) {
  return context.runProcedure(node, env);
}

const runStatement = {
  keywords: ['RUN'],
  parse: parseRun,
  executors: {
    Run: executeRun
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = runStatement;
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
  globalScope.Mini4GLStatementModules.push(runStatement);
}
