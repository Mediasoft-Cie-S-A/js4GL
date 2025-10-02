'use strict';

function parseProcedure(parser) {
  parser.eat('PROCEDURE');
  const name = parser.eat('IDENT').value.toLowerCase();

  let isPrivate = false;
  let external = null;
  let inSuper = false;

  const takeKeyword = (keyword) => {
    const tok = parser.peek();
    if (!tok) {
      return false;
    }
    if (tok.type === keyword) {
      parser.eat(keyword);
      return true;
    }
    if (tok.type === 'IDENT' && String(tok.value).toUpperCase() === keyword) {
      parser.eat('IDENT');
      return true;
    }
    return false;
  };

  const parseThreadSafe = () => {
    if (!takeKeyword('THREAD')) {
      return false;
    }
    const maybeDash = parser.peek();
    if (maybeDash && maybeDash.type === 'OP' && maybeDash.value === '-') {
      parser.eat('OP');
    }
    if (!takeKeyword('SAFE')) {
      throw new SyntaxError('Expected SAFE after THREAD-');
    }
    return true;
  };

  let parsingHeader = true;
  while (parsingHeader) {
    const tok = parser.peek();
    if (!tok) {
      break;
    }
    if (!isPrivate && takeKeyword('PRIVATE')) {
      isPrivate = true;
      continue;
    }
    if (!external && !inSuper && takeKeyword('EXTERNAL')) {
      const libraryTok = parser.peek();
      if (libraryTok.type !== 'STRING') {
        throw new SyntaxError('Expected string literal after EXTERNAL');
      }
      const library = parser.eat('STRING').value;
      let callingConvention = null;
      const conventionTok = parser.peek();
      if (conventionTok && ['CDECL', 'PASCAL', 'STDCALL'].includes(conventionTok.type)) {
        callingConvention = parser.eat(conventionTok.type).type;
      }
      let ordinal = null;
      if (takeKeyword('ORDINAL')) {
        const ordTok = parser.peek();
        if (ordTok.type !== 'NUMBER') {
          throw new SyntaxError('Expected numeric literal after ORDINAL');
        }
        ordinal = parser.eat('NUMBER').value;
      }
      const persistent = takeKeyword('PERSISTENT');
      const threadSafe = parseThreadSafe();
      external = {
        library,
        callingConvention,
        ordinal,
        persistent,
        threadSafe
      };
      continue;
    }
    if (!external && !inSuper && takeKeyword('IN')) {
      if (!takeKeyword('SUPER')) {
        throw new SyntaxError('Expected SUPER after IN');
      }
      inSuper = true;
      continue;
    }
    parsingHeader = false;
  }

  let prototypeOnly = false;
  let statements = [];
  if (parser.match('COLON')) {
    statements = parser.parseBlockStatements();
    parser.eat('END');
    const maybeProcedureTok = parser.peek();
    if (
      maybeProcedureTok &&
      (maybeProcedureTok.type === 'PROCEDURE' ||
        (maybeProcedureTok.type === 'IDENT' && String(maybeProcedureTok.value).toUpperCase() === 'PROCEDURE'))
    ) {
      parser.eat(maybeProcedureTok.type);
    }
    parser.optionalDot();
  } else if (parser.match('DOT')) {
    prototypeOnly = true;
  } else {
    throw new SyntaxError('Expected : or . after PROCEDURE header');
  }

  const parameters = [];
  const body = [];
  for (const stmt of statements) {
    if (!stmt) {
      continue;
    }
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
    if (stmt.type !== 'Empty') {
      body.push(stmt);
    }
  }

  return {
    type: 'Procedure',
    name,
    parameters,
    body,
    isPrivate,
    external,
    inSuper,
    prototypeOnly
  };
}

function executeProcedure(node, env) {
  if (!env.procedures) {
    env.procedures = Object.create(null);
  }
  env.procedures[node.name] = {
    type: 'Procedure',
    name: node.name,
    parameters: Array.isArray(node.parameters) ? node.parameters : [],
    body: Array.isArray(node.body) ? node.body : [],
    isPrivate: !!node.isPrivate,
    external: node.external ? { ...node.external } : null,
    inSuper: !!node.inSuper,
    prototypeOnly: !!node.prototypeOnly,
    ownerEnv: env
  };
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
