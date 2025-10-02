'use strict';

function matchesKeyword(tok, keyword) {
  if (!tok) {
    return false;
  }
  if (tok.type === keyword) {
    return true;
  }
  if (tok.type === 'IDENT' && String(tok.value).toUpperCase() === keyword) {
    return true;
  }
  return false;
}

function consumeKeyword(parser, keyword) {
  const tok = parser.peek();
  if (tok.type === keyword) {
    return parser.eat(keyword);
  }
  if (tok.type === 'IDENT' && String(tok.value).toUpperCase() === keyword) {
    return parser.eat('IDENT');
  }
  throw new SyntaxError(`Expected ${keyword}`);
}

function parseDo(parser) {
  let label = null;
  const firstTok = parser.peek();
  const secondTok = parser.toks[parser.i + 1];
  const thirdTok = parser.toks[parser.i + 2];
  if (
    firstTok.type === 'IDENT' &&
    secondTok && secondTok.type === 'COLON' &&
    thirdTok && matchesKeyword(thirdTok, 'DO')
  ) {
    label = parser.eat('IDENT').value;
    parser.eat('COLON');
  }

  parser.eat('DO');

  const forRecords = [];
  let whileExpr = null;
  let loopControl = null;
  let isTransaction = false;

  let parsingOptions = true;
  while (parsingOptions) {
    const tok = parser.peek();
    if (matchesKeyword(tok, 'FOR') && forRecords.length === 0) {
      parser.eat(tok.type);
      const parseRecordName = () => {
        const path = parser.parseFieldPath();
        const name = path[path.length - 1];
        return { name, path };
      };
      forRecords.push(parseRecordName());
      while (parser.match('COMMA')) {
        forRecords.push(parseRecordName());
      }
      continue;
    }
    if (matchesKeyword(tok, 'TRANSACTION') && !isTransaction) {
      parser.eat(tok.type);
      isTransaction = true;
      continue;
    }
    if (!loopControl && tok.type === 'IDENT') {
      const nextTok = parser.toks[parser.i + 1];
      if (nextTok && nextTok.type === 'OP' && nextTok.value === '=') {
        const variableToken = parser.eat('IDENT');
        parser.eat('OP');
        const fromExpr = parser.parseExpr();
        if (!matchesKeyword(parser.peek(), 'TO')) {
          throw new SyntaxError('Expected TO in DO iteration range');
        }
        consumeKeyword(parser, 'TO');
        const toExpr = parser.parseExpr();
        let byExpr = null;
        if (matchesKeyword(parser.peek(), 'BY')) {
          parser.eat(parser.peek().type);
          byExpr = parser.parseExpr();
        }
        loopControl = {
          variable: variableToken.value.toLowerCase(),
          fromExpr,
          toExpr,
          byExpr
        };
        continue;
      }
    }
    if (!whileExpr && matchesKeyword(tok, 'WHILE')) {
      parser.eat(tok.type);
      whileExpr = parser.parseExpr();
      continue;
    }
    parsingOptions = false;
  }

  parser.match('COLON');
  const body = parser.parseBlockStatements();
  parser.eat('END');
  parser.optionalDot();
  return {
    type: 'Do',
    label,
    whileExpr,
    body,
    loopControl,
    forRecords,
    transaction: isTransaction
  };
}

async function executeDo(node, env, context) {
  const withRecordScope = async (run) => {
    if (!node.forRecords || node.forRecords.length === 0) {
      await run();
      return;
    }
    if (!env.records) {
      env.records = Object.create(null);
    }
    const saved = node.forRecords.map((record) => {
      const key = record.name.toLowerCase();
      const hadRecord = Object.prototype.hasOwnProperty.call(env.records, key);
      const previousRecord = hadRecord ? env.records[key] : undefined;
      env.records[key] = null;
      const hadVar = Object.prototype.hasOwnProperty.call(env.vars, key);
      const previousVar = hadVar ? env.vars[key] : undefined;
      env.vars[key] = null;
      return { key, hadRecord, previousRecord, hadVar, previousVar };
    });
    try {
      await run();
    } finally {
      for (const entry of saved) {
        if (entry.hadRecord) {
          env.records[entry.key] = entry.previousRecord;
        } else {
          delete env.records[entry.key];
        }
        if (entry.hadVar) {
          env.vars[entry.key] = entry.previousVar;
        } else {
          delete env.vars[entry.key];
        }
      }
    }
  };

  const runIteration = async () => {
    await withRecordScope(async () => {
      await context.execBlock({ type: 'Block', body: node.body }, env);
    });
  };

  const conditionTrue = () => {
    if (!node.whileExpr) {
      return true;
    }
    return context.truthy(context.evalExpr(node.whileExpr, env));
  };

  if (node.loopControl) {
    const stepRaw = node.loopControl.byExpr
      ? context.evalExpr(node.loopControl.byExpr, env)
      : 1;
    const step = Number(stepRaw);
    if (!Number.isFinite(step) || step === 0) {
      throw new Error('DO loop BY value must be a non-zero finite number');
    }
    let current = Number(context.evalExpr(node.loopControl.fromExpr, env));
    const compare = (value, limit) => (step >= 0 ? value <= limit : value >= limit);
    while (true) {
      const limit = Number(context.evalExpr(node.loopControl.toExpr, env));
      if (!Number.isFinite(limit) || !Number.isFinite(current)) {
        throw new Error('DO loop bounds must evaluate to finite numbers');
      }
      if (!compare(current, limit)) {
        break;
      }
      context.setVar(env, node.loopControl.variable, current);
      if (!conditionTrue()) {
        break;
      }
      await runIteration();
      current += step;
    }
    return;
  }

  if (node.whileExpr) {
    while (conditionTrue()) {
      await runIteration();
    }
    return;
  }

  await runIteration();
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
