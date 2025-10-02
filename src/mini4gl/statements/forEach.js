'use strict';

function parseForEach(parser) {
  parser.eat('FOR');
  const qualifierTok = parser.peek();
  if (!['EACH', 'FIRST', 'LAST'].includes(qualifierTok.type)) {
    throw new SyntaxError('Expected EACH, FIRST, or LAST after FOR');
  }
  const qualifier = parser.eat(qualifierTok.type).type;
  const target = parser.eat('IDENT').value;
  let relation = null;
  if (parser.match('OF')) {
    relation = parser.eat('IDENT').value;
  }
  let noLock = false;
  if (parser.match('NO')) {
    if (parser.peek().type === 'OP' && parser.peek().value === '-') {
      parser.eat('OP');
    }
    const lockTok = parser.peek();
    if (lockTok.type === 'LOCK' || (lockTok.type === 'IDENT' && String(lockTok.value).toUpperCase() === 'LOCK')) {
      parser.eat(lockTok.type);
      noLock = true;
    } else {
      throw new SyntaxError('Expected LOCK after NO in FOR EACH');
    }
  }
  let where = null;
  if (parser.match('WHERE')) {
    where = parser.parseExpr();
  }
  const orderBy = [];
  while (true) {
    let hadBreak = false;
    if (parser.match('BREAK')) {
      hadBreak = true;
    }
    if (!parser.match('BY')) {
      if (hadBreak) {
        throw new SyntaxError('BREAK must be followed by BY');
      }
      break;
    }
    const path = parser.parseFieldPath();
    const descending = !!parser.match('DESCENDING');
    orderBy.push({ path, descending, break: hadBreak });
  }
  parser.eat('COLON');
  const body = parser.parseBlockStatements();
  parser.eat('END');
  parser.optionalDot();
  return { type: 'ForEach', qualifier, target, relation, where, orderBy, body, noLock };
}

async function executeForEach(node, env, context) {
  const prisma = env.prisma;
  if (!prisma) {
    throw new Error('Prisma client is required for FOR EACH statements');
  }
  const targetLower = node.target.toLowerCase();
  const delegateName = context.lowerFirst(node.target);
  const delegate = prisma[delegateName];
  if (!delegate || typeof delegate.findMany !== 'function') {
    throw new Error(`Prisma model ${node.target} is not available`);
  }
  const qualifier = (node.qualifier || 'EACH').toUpperCase();
  const query = {};
  const whereClause = context.buildWhere(node.where, env, targetLower);
  if (whereClause) {
    query.where = whereClause;
  }
  if (node.relation) {
    const parentKey = node.relation.toLowerCase();
    const parentRecord = env.records ? env.records[parentKey] : undefined;
    if (!parentRecord) {
      throw new Error(`No active record for ${node.relation} to satisfy FOR EACH ${node.target} OF ${node.relation}`);
    }
    const relationClause = context.relationWhere(targetLower, parentKey, parentRecord);
    query.where = context.mergeWhereClauses(query.where || null, relationClause);
  }
  if (qualifier === 'EACH' && node.orderBy && node.orderBy.length) {
    query.orderBy = node.orderBy.map((entry) => context.buildOrderBy(entry, targetLower, env));
  }
  let results = [];
  if (qualifier === 'FIRST') {
    if (typeof delegate.findFirst !== 'function') {
      throw new Error(`Prisma model ${node.target} does not support findFirst`);
    }
    const record = await delegate.findFirst(query);
    if (record) {
      results = [record];
    }
  } else if (qualifier === 'LAST') {
    const list = await delegate.findMany(query);
    if (list.length) {
      results = [list[list.length - 1]];
    }
  } else {
    results = await delegate.findMany(query);
  }
  const hadRecord = env.records && Object.prototype.hasOwnProperty.call(env.records, targetLower);
  const hadVar = Object.prototype.hasOwnProperty.call(env.vars, targetLower);
  const prevRecord = hadRecord ? env.records[targetLower] : undefined;
  const prevVar = hadVar ? env.vars[targetLower] : undefined;
  if (env.records) {
    env.records[targetLower] = null;
  }
  for (const row of results) {
    if (env.records) {
      env.records[targetLower] = row;
    }
    env.vars[targetLower] = row;
    await context.execBlock({ type: 'Block', body: node.body }, env);
  }
  if (env.records) {
    if (hadRecord) {
      env.records[targetLower] = prevRecord;
    } else {
      delete env.records[targetLower];
    }
  }
  if (hadVar) {
    env.vars[targetLower] = prevVar;
  } else {
    delete env.vars[targetLower];
  }
}

const forEachStatement = {
  keywords: ['FOR'],
  parse: parseForEach,
  executors: {
    ForEach: executeForEach
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = forEachStatement;
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
  globalScope.Mini4GLStatementModules.push(forEachStatement);
}
