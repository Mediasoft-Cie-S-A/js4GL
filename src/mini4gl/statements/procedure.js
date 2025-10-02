'use strict';

function parseProcedure(parser) {
  parser.eat('PROCEDURE');
  const name = parser.eat('IDENT').value.toLowerCase();
  parser.match('COLON');
  const body = [];
  const parameters = [];
  while (true) {
    const next = parser.peek();
    if (next.type === 'EOF') {
      throw new SyntaxError(`Unexpected EOF inside PROCEDURE ${name}`);
    }
    if (next.type === 'END') {
      const lookahead = parser.toks[parser.i + 1];
      if (lookahead && lookahead.type === 'PROCEDURE') {
        parser.eat('END');
        parser.eat('PROCEDURE');
        parser.optionalDot();
        break;
      }
    }
    if (parser.match('DOT')) {
      continue;
    }
    const stmt = parser.parseStatement();
    if (stmt.type === 'DefineParameter') {
      parameters.push({
        name: stmt.id,
        mode: stmt.mode,
        dataType: stmt.dataType,
        init: stmt.init,
        noUndo: stmt.noUndo
      });
      continue;
    }
    body.push(stmt);
  }
  return { type: 'Procedure', name, parameters, body };
}

function executeProcedure(node, env) {
  if (!env.procedures) {
    env.procedures = Object.create(null);
  }
  env.procedures[node.name] = node;
}

const procedureStatement = {
  keywords: ['PROCEDURE'],
  parse: parseProcedure,
  executors: {
    Procedure: executeProcedure
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = procedureStatement;
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
  globalScope.Mini4GLStatementModules.push(procedureStatement);
}
