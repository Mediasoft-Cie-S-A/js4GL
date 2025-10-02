'use strict';

function parseFind(parser) {
  parser.eat('FIND');
  let qualifier = null;
  if (parser.match('FIRST')) {
    qualifier = 'FIRST';
  }
  const target = parser.eat('IDENT').value;
  let relation = null;
  if (parser.match('OF')) {
    relation = parser.eat('IDENT').value;
  }
  let where = null;
  if (parser.match('WHERE')) {
    where = parser.parseExpr();
  }
  let noError = false;
  if (parser.match('NO')) {
    if (parser.peek().type === 'OP' && parser.peek().value === '-') {
      parser.eat('OP');
    }
    const errTok = parser.peek();
    if (errTok.type === 'ERROR' || (errTok.type === 'IDENT' && String(errTok.value).toUpperCase() === 'ERROR')) {
      parser.eat(errTok.type);
    }
    noError = true;
  }
  parser.optionalDot();
  return { type: 'Find', target, relation, where, qualifier, noError };
}

async function executeFind(node, env, context) {
  const prisma = env.prisma;
  if (!prisma) {
    throw new Error('Prisma client is required for FIND statements');
  }
  const targetLower = node.target.toLowerCase();
  const delegateName = context.lowerFirst(node.target);
  const delegate = prisma[delegateName];
  if (!delegate || typeof delegate.findFirst !== 'function') {
    throw new Error(`Prisma model ${node.target} is not available`);
  }
  const query = {};
  const whereClause = context.buildWhere(node.where, env, targetLower);
  if (whereClause) {
    query.where = whereClause;
  }
  if (node.relation) {
    const parentKey = node.relation.toLowerCase();
    const parentRecord = env.records ? env.records[parentKey] : undefined;
    if (!parentRecord) {
      throw new Error(`No active record for ${node.relation} to satisfy FIND ${node.target} OF ${node.relation}`);
    }
    const relationClause = context.relationWhere(targetLower, parentKey, parentRecord);
    query.where = context.mergeWhereClauses(query.where || null, relationClause);
  }
  const record = await delegate.findFirst(query);
  if (!record) {
    if (node.noError) {
      if (env.records) {
        env.records[targetLower] = null;
      }
      env.vars[targetLower] = null;
      return;
    }
    throw new Error(`FIND ${node.target} failed: no record found`);
  }
  if (env.records) {
    env.records[targetLower] = record;
  }
  env.vars[targetLower] = record;
}

const exported = {
  keywords: ['FIND'],
  parse: parseFind,
  executors: {
    Find: executeFind
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
