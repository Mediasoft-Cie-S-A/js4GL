'use strict';

function parseInput(parser) {
  parser.eat('INPUT');
  const id = parser.eat('IDENT').value.toLowerCase();
  parser.optionalDot();
  return { type: 'Input', id };
}

function executeInput(node, env, context) {
  const value = env.inputs.length ? env.inputs.shift() : null;
  context.setVar(env, node.id, value);
}

const exported = {
  keywords: ['INPUT'],
  parse: parseInput,
  executors: {
    Input: executeInput
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
