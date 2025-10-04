'use strict';

function isExprStartToken(tok) {
  if (!tok) return false;
  if (['IDENT', 'NUMBER', 'STRING', 'UNKNOWN', 'LPAREN'].includes(tok.type)) return true;
  if (tok.type === 'OP' && (tok.value === '+' || tok.value === '-')) return true;
  if (tok.type === 'NOT') return true;
  return false;
}

function parseDisplay(parser) {
  const keyword = parser.peek().type;
  parser.eat(keyword);
  const items = [];
  while (true) {
    const expr = parser.parseExpr();
    const meta = { expr };
    while (true) {
      const next = parser.peek();
      if (next.type === 'LABEL') {
        parser.eat('LABEL');
        meta.label = parser.parseExpr();
        continue;
      }
      if (next.type === 'FORMAT') {
        parser.eat('FORMAT');
        meta.format = parser.parseExpr();
        continue;
      }
      break;
    }
    items.push(meta);
    if (parser.match('COMMA')) {
      continue;
    }
    const next = parser.peek();
    if (isExprStartToken(next)) {
      continue;
    }
    break;
  }
  const withOptions = [];
  if (parser.match('WITH')) {
    while (true) {
      const next = parser.peek();
      if (next.type === 'CENTERED') {
        parser.eat('CENTERED');
        withOptions.push('CENTERED');
      } else if (next.type === 'FRAME') {
        parser.eat('FRAME');
        const frameTarget = parser.peek();
        if (isExprStartToken(frameTarget)) {
          parser.parseExpr();
        }
        withOptions.push('FRAME');
      } else if (next.type === 'IDENT') {
        withOptions.push(parser.eat('IDENT').value.toUpperCase());
      } else {
        break;
      }
      if (!parser.match('COMMA')) {
        break;
      }
    }
  }
  parser.optionalDot();
  return { type: 'Display', items, withOptions };
}

function isWidgetValue(value) {
  return value && typeof value === 'object' && value.__mini4glWidget;
}

function cloneWidgetAttributes(widget) {
  const attributes = Object.create(null);
  const source = widget && widget.attributes;
  if (!source || typeof source !== 'object') {
    return attributes;
  }
  for (const [key, val] of Object.entries(source)) {
    if (typeof val === 'function') {
      continue;
    }
    try {
      attributes[key] = val;
    } catch (_) {
      // Ignore attributes that cannot be copied as-is.
    }
  }
  return attributes;
}

function buildWidgetSegment(widget, context) {
  const upperType = widget && widget.type ? String(widget.type).toUpperCase() : null;
  const isCreated = !!(widget && widget.created);
  const hasEnabledFlag = !!(widget && Object.prototype.hasOwnProperty.call(widget, 'enabled'));
  const hasVisibleFlag = !!(widget && Object.prototype.hasOwnProperty.call(widget, 'visible'));
  const segment = {
    kind: 'widget',
    widgetType: upperType,
    widgetName: widget && (widget.displayName || widget.name) ? String(widget.displayName || widget.name) : null,
    attributes: cloneWidgetAttributes(widget),
    enabled: isCreated
      ? widget && widget.enabled !== false
      : hasEnabledFlag && widget && widget.enabled === true
        ? true
        : true,
    visible: isCreated
      ? widget && widget.visible !== false
      : hasVisibleFlag && widget && widget.visible === true
        ? true
        : true,
    label: ''
  };
  if (context && typeof context.describeWidgetValue === 'function') {
    try {
      segment.label = context.describeWidgetValue(widget);
    } catch (_) {
      segment.label = '';
    }
  }
  if (!segment.label && segment.attributes && segment.attributes.LABEL != null) {
    segment.label = String(segment.attributes.LABEL);
  }
  if (!segment.label && segment.widgetName) {
    segment.label = segment.widgetName;
  }
  return segment;
}

function mergeAdjacentTextSegments(segments) {
  const merged = [];
  for (const segment of segments) {
    if (!segment) {
      continue;
    }
    if (segment.kind === 'text') {
      const text = segment.text != null ? String(segment.text) : '';
      if (!merged.length || merged[merged.length - 1].kind !== 'text') {
        merged.push({ kind: 'text', text });
      } else {
        merged[merged.length - 1].text += text;
      }
      continue;
    }
    merged.push(segment);
  }
  return merged;
}

function executeDisplay(node, env, context) {
  const hasCenteredOption =
    Array.isArray(node.withOptions) &&
    node.withOptions.some((opt) => String(opt).toUpperCase() === 'CENTERED');

  const segments = [];
  let containsWidget = false;

  node.items.forEach((item, index) => {
    if (index > 0) {
      segments.push({ kind: 'text', text: ' ' });
    }
    const value = context.evalExpr(item.expr, env);
    const labelValue = item.label ? context.evalExpr(item.label, env) : null;
    const labelText = labelValue == null ? '' : String(labelValue);

    if (isWidgetValue(value)) {
      containsWidget = true;
      if (labelText) {
        segments.push({ kind: 'text', text: `${labelText} ` });
      }
      segments.push(buildWidgetSegment(value, context));
      return;
    }

    const formatted = context.formatDisplayValue(
      value,
      item.format ? context.evalExpr(item.format, env) : null
    );
    const text = labelText ? `${labelText} ${formatted}`.trim() : formatted;
    segments.push({ kind: 'text', text });
  });

  if (!containsWidget) {
    const combined = segments.map((segment) => String(segment.text || '')).join('');
    const finalLine = hasCenteredOption ? context.centerLine(combined) : combined;
    env.output(finalLine);
    return;
  }

  const mergedSegments = mergeAdjacentTextSegments(segments);
  env.output({
    kind: 'rich',
    centered: !!hasCenteredOption,
    segments: mergedSegments
  });
}

const displayStatement = {
  keywords: ['DISPLAY', 'PRINT'],
  parse: parseDisplay,
  executors: {
    Display: executeDisplay
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = displayStatement;
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
  globalScope.Mini4GLStatementModules.push(displayStatement);
}
