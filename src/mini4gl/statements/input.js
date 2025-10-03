'use strict';

function lookaheadMatches(parser, sequence) {
  for (let i = 0; i < sequence.length; i++) {
    const expected = sequence[i];
    const tok = parser.toks[parser.i + i];
    if (!tok) return false;
    if (expected === '-') {
      if (tok.type !== 'OP' || tok.value !== '-') return false;
      continue;
    }
    if (tok.type !== expected) {
      return false;
    }
  }
  return true;
}

function consumeHyphenatedKeyword(parser, sequence) {
  for (const part of sequence) {
    if (part === '-') {
      parser.eat('OP');
    } else {
      parser.eat(part);
    }
  }
}

function parseStreamClause(parser) {
  if (parser.peek().type === 'STREAM') {
    parser.eat('STREAM');
    const streamIdent = parser.eat('IDENT').value.toLowerCase();
    return { kind: 'STREAM', name: streamIdent };
  }
  if (lookaheadMatches(parser, ['STREAM', '-', 'HANDLE'])) {
    consumeHyphenatedKeyword(parser, ['STREAM', '-', 'HANDLE']);
    const handleIdent = parser.eat('IDENT').value.toLowerCase();
    return { kind: 'STREAM-HANDLE', name: handleIdent };
  }
  return null;
}

function parseValueExpression(parser) {
  parser.eat('VALUE');
  parser.eat('LPAREN');
  const expr = parser.parseExpr();
  parser.eat('RPAREN');
  return expr;
}

function parseInputSource(parser) {
  if (parser.match('TERMINAL')) {
    return { kind: 'TERMINAL' };
  }
  if (parser.peek().type === 'VALUE') {
    const expr = parseValueExpression(parser);
    return { kind: 'VALUE', expr };
  }
  if (lookaheadMatches(parser, ['OS', '-', 'DIR'])) {
    consumeHyphenatedKeyword(parser, ['OS', '-', 'DIR']);
    parser.eat('LPAREN');
    const directory = parser.parseExpr();
    parser.eat('RPAREN');
    let noAttrList = false;
    if (lookaheadMatches(parser, ['NO', '-', 'ATTR', '-', 'LIST'])) {
      consumeHyphenatedKeyword(parser, ['NO', '-', 'ATTR', '-', 'LIST']);
      noAttrList = true;
    }
    return { kind: 'OS-DIR', directory, noAttrList };
  }
  const expr = parser.parseExpr();
  return { kind: 'EXPR', expr };
}

function parseLobDir(parser) {
  if (!lookaheadMatches(parser, ['LOB', '-', 'DIR'])) {
    return null;
  }
  consumeHyphenatedKeyword(parser, ['LOB', '-', 'DIR']);
  if (parser.peek().type === 'VALUE') {
    const expr = parseValueExpression(parser);
    return { kind: 'VALUE', expr };
  }
  const expr = parser.parseExpr();
  return { kind: 'EXPR', expr };
}

function parseInputOptions(parser) {
  const options = {
    lobDir: null,
    binary: false,
    echo: null,
    map: null,
    unbuffered: false,
    convert: null
  };

  let consumed = false;
  while (true) {
    const lobDir = parseLobDir(parser);
    if (lobDir) {
      options.lobDir = lobDir;
      consumed = true;
      continue;
    }
    if (parser.match('BINARY')) {
      options.binary = true;
      consumed = true;
      continue;
    }
    if (lookaheadMatches(parser, ['NO', '-', 'ECHO'])) {
      consumeHyphenatedKeyword(parser, ['NO', '-', 'ECHO']);
      options.echo = false;
      consumed = true;
      continue;
    }
    if (parser.match('ECHO')) {
      options.echo = true;
      consumed = true;
      continue;
    }
    if (lookaheadMatches(parser, ['NO', '-', 'MAP'])) {
      consumeHyphenatedKeyword(parser, ['NO', '-', 'MAP']);
      options.map = { kind: 'NONE' };
      consumed = true;
      continue;
    }
    if (parser.match('MAP')) {
      const entry = parser.parseExpr();
      options.map = { kind: 'ENTRY', entry };
      consumed = true;
      continue;
    }
    if (parser.match('UNBUFFERED')) {
      options.unbuffered = true;
      consumed = true;
      continue;
    }
    if (lookaheadMatches(parser, ['NO', '-', 'CONVERT'])) {
      consumeHyphenatedKeyword(parser, ['NO', '-', 'CONVERT']);
      options.convert = { kind: 'NONE' };
      consumed = true;
      continue;
    }
    if (parser.match('CONVERT')) {
      let targetCodepage = null;
      let sourceCodepage = null;
      if (parser.match('TARGET')) {
        targetCodepage = parser.parseExpr();
      }
      if (parser.match('SOURCE')) {
        sourceCodepage = parser.parseExpr();
      }
      options.convert = {
        kind: 'CONVERT',
        target: targetCodepage,
        source: sourceCodepage
      };
      consumed = true;
      continue;
    }
    break;
  }

  return consumed ? options : null;
}

function parseInput(parser) {
  parser.eat('INPUT');
  const stream = parseStreamClause(parser);
  let target = null;
  const nextTok = parser.peek();
  if (nextTok.type === 'IDENT') {
    target = parser.eat('IDENT').value.toLowerCase();
  }

  let source = null;
  let options = null;
  if (parser.match('FROM')) {
    source = parseInputSource(parser);
    options = parseInputOptions(parser);
  }

  if (!target && !source && !stream) {
    throw new SyntaxError('INPUT statement requires a target variable or FROM clause');
  }

  parser.optionalDot();
  return {
    type: 'Input',
    target,
    stream,
    source,
    options
  };
}

function readFromTerminal(targetName) {
  const label = targetName ? `Enter value for ${targetName}` : 'Enter value';
  if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
    const result = window.prompt(label, '');
    return result !== null ? result : null;
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.prompt === 'function') {
    const result = globalThis.prompt(label, '');
    return result !== null ? result : null;
  }
  return null;
}

function takeNextInput(env) {
  return env.inputs && env.inputs.length ? env.inputs.shift() : null;
}

function resolveSourceValue(node, env, context) {
  if (!node.source) {
    const queued = takeNextInput(env);
    return queued !== null ? queued : readFromTerminal(node.target);
  }

  if (node.source.kind === 'EXPR') {
    return context.evalExpr(node.source.expr, env);
  }

  switch (node.source.kind) {
    case 'TERMINAL': {
      const queued = takeNextInput(env);
      if (queued !== null) {
        return queued;
      }
      return readFromTerminal(node.target);
    }
    case 'VALUE':
      return context.evalExpr(node.source.expr, env);
    default:
      throw new Error(`INPUT FROM ${node.source.kind} is not supported in this runtime`);
  }
}

function executeInput(node, env, context) {
  if (!node.target) {
    if (node.stream) {
      throw new Error('INPUT STREAM configuration is not supported in this runtime');
    }
    if (node.source) {
      throw new Error('INPUT FROM without a target variable is not supported in this runtime');
    }
    return;
  }

  const value = resolveSourceValue(node, env, context);
  context.setVar(env, node.target, value);
}

const inputStatement = {
  keywords: ['INPUT'],
  parse: parseInput,
  executors: {
    Input: executeInput
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = inputStatement;
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
  globalScope.Mini4GLStatementModules.push(inputStatement);
}
