'use strict';

const RAW_PATTERNS = [
  { name: 'SELECTION-LIST', tokens: ['SELECTION', '-', 'LIST'] },
  { name: 'SHADOW-WINDOW', tokens: ['SHADOW', '-', 'WINDOW'] },
  { name: 'SUB-MENU', tokens: ['SUB', '-', 'MENU'] },
  { name: 'MENU-ITEM', tokens: ['MENU', '-', 'ITEM'] },
  { name: 'CONTROL-FRAME', tokens: ['CONTROL', '-', 'FRAME'] },
  { name: 'DIALOG-BOX', tokens: ['DIALOG', '-', 'BOX'] },
  { name: 'FIELD-GROUP', tokens: ['FIELD', '-', 'GROUP'] },
  { name: 'COMBO-BOX', tokens: ['COMBO', '-', 'BOX'] },
  { name: 'TOGGLE-BOX', tokens: ['TOGGLE', '-', 'BOX'] },
  { name: 'RADIO-SET', tokens: ['RADIO', '-', 'SET'] },
  { name: 'FILL-IN', tokens: ['FILL', '-', 'IN'] },
  { name: 'WINDOW', tokens: ['WINDOW'] },
  { name: 'TEXT', tokens: ['TEXT'] },
  { name: 'SLIDER', tokens: ['SLIDER'] },
  { name: 'RECTANGLE', tokens: ['RECTANGLE'] },
  { name: 'MENU', tokens: ['MENU'] },
  { name: 'LITERAL', tokens: ['LITERAL'] },
  { name: 'IMAGE', tokens: ['IMAGE'] },
  { name: 'FRAME', tokens: ['FRAME'] },
  { name: 'EDITOR', tokens: ['EDITOR'] },
  { name: 'BUTTON', tokens: ['BUTTON'] },
  { name: 'BROWSE', tokens: ['BROWSE'] }
];

const UNIQUE_PATTERNS = [];
const seen = new Set();
for (const pattern of RAW_PATTERNS) {
  if (seen.has(pattern.name)) {
    continue;
  }
  seen.add(pattern.name);
  UNIQUE_PATTERNS.push(pattern);
}

UNIQUE_PATTERNS.sort((a, b) => b.tokens.length - a.tokens.length);

function peekAhead(parser, offset) {
  return parser.toks[parser.i + offset];
}

function tokenMatchesPart(token, part) {
  if (!token) {
    return false;
  }
  if (part === '-') {
    return token.type === 'OP' && token.value === '-';
  }
  const upper = token.type === 'IDENT' ? token.value.toUpperCase() : token.type;
  return upper === part;
}

function consumePart(parser, part) {
  if (part === '-') {
    const tok = parser.eat('OP');
    if (tok.value !== '-') {
      throw new SyntaxError('Expected hyphen in widget type');
    }
    return;
  }
  const next = parser.peek();
  if (!next) {
    throw new SyntaxError(`Unexpected end while reading widget type ${part}`);
  }
  if (next.type === 'IDENT') {
    const consumed = parser.eat('IDENT');
    if (consumed.value.toUpperCase() !== part) {
      throw new SyntaxError(`Expected ${part} in widget type`);
    }
    return;
  }
  if (next.type === part) {
    parser.eat(part);
    return;
  }
  throw new SyntaxError(`Unexpected token ${next.type} when reading widget type`);
}

function matchesPattern(parser, pattern) {
  for (let index = 0; index < pattern.tokens.length; index += 1) {
    const part = pattern.tokens[index];
    const token = peekAhead(parser, index);
    if (!tokenMatchesPart(token, part)) {
      return false;
    }
  }
  return true;
}

function readWidgetType(parser) {
  for (const pattern of UNIQUE_PATTERNS) {
    if (matchesPattern(parser, pattern)) {
      for (const part of pattern.tokens) {
        consumePart(parser, part);
      }
      return pattern.name;
    }
  }
  const next = parser.peek();
  const near = next ? String(next.value || next.type) : 'EOF';
  throw new SyntaxError(`Unknown widget type near ${near}`);
}
const exported = {
  SUPPORTED_WIDGET_TYPES: UNIQUE_PATTERNS.map((p) => p.name),
  readWidgetType
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
  globalScope.Mini4GLWidgetTypes = exported;
}
