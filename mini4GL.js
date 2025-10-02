/*
  Mini OpenEdge/Progress 4GL Interpreter in JavaScript
  ---------------------------------------------------
  ⚠️ Scope: This is a compact, browser/node-friendly interpreter for a **practical subset** of OpenEdge/Progress 4GL.
  It focuses on the core control-flow and expressions so you can prototype quickly, and extend it for your needs.

  Supported (subset):
  - Statement terminators: period (.) or newline at block END. Whitespace-insensitive, case-insensitive keywords.
  - Variables: implicit declaration on first assignment; global scope for simplicity.
  - Assignment: `ASSIGN x = 1.` or `x = 1.`
  - DISPLAY: `DISPLAY x, "text", 1+2.` -> pushes lines to output callback
  - INPUT: `INPUT x.` -> pulls a value from provided input queue (strings or numbers)
  - IF / THEN / ELSE / END: single statement or DO block
  - DO ... END blocks (optionally with WHILE):
      DO:
        ...
      END.
      DO WHILE expr:
        ...
      END.
  - WHILE ... DO ... END (classic form)
  - REPEAT WITH WHILE expr: REPEAT WHILE expr: ... END.
  - FOR EACH ... : loops over Prisma model records with optional WHERE/BY/OF.
  - FIND ... : fetches a single Prisma record (supports FIRST, WHERE, OF, NO-ERROR).
  - Expressions: + - * /, parentheses, comparisons (=, <>, <, <=, >, >=), logical AND/OR/NOT
  - Strings with double quotes, numbers (int/float).
   - Builtins: UPPER(s), LOWER(s), LENGTH(s), INT(n), INTEGER(n), DECIMAL(x), FLOAT(n), STRING(v[, format]), PRINT(...) alias of DISPLAY

  Not implemented (you can extend): database buffers, TRANSACTION, temp-tables, advanced locking hints, triggers, frames.

  Usage (Node):
    const { interpret4GL } = require('./mini4gl.js');
    const program = `
      ASSIGN n = 3.
      DO WHILE n > 0:
        DISPLAY "tick", n.
        n = n - 1.
      END.
      DISPLAY "done".
    `;
    const { output, env } = interpret4GL(program, { inputs: [] });
    console.log(output.join('\n'));

  Usage (Browser):
    interpret4GL(program, { onOutput: line => console.log(line), inputs: ["hello"] });

  Design notes:
    - Tokenizer + recursive-descent parser builds a small AST. Interpreter walks AST.
    - Case-insensitive keywords/identifiers. Variables stored as lower-case keys.
    - Period (.) ends simple statements. `END.` ends blocks. A colon after DO/REPEAT/WHILE header starts block body.
*/

(function (global) {
  const parserModule = (typeof require === 'function'
    ? require('./src/mini4gl/parser')
    : (global.Mini4GLParser || null));

  if (!parserModule) {
    throw new Error('Mini4GL parser module is not available. Ensure parser module is loaded.');
  }

  const { tokenize, createParser } = parserModule;

  const statementRegistry = (typeof require === 'function'
    ? require('./src/mini4gl/statements')
    : (global.Mini4GLStatementRegistry || null));

  if (!statementRegistry) {
    throw new Error('Mini4GL statement registry is not available. Ensure statement modules are loaded.');
  }

  const STATEMENT_EXECUTORS = statementRegistry.executors || Object.create(null);

  const builtinsModule = (typeof require === 'function'
    ? require('./src/mini4gl/builtins')
    : (global.Mini4GLBuiltins || null));

  if (!builtinsModule) {
    throw new Error('Mini4GL builtins module is not available. Ensure builtins module is loaded.');
  }

  const { createBuiltinEvaluator } = builtinsModule;

  let defaultPrismaClient;
  let defaultPrismaEnsureReady;
  let triedDefaultPrisma = false;

  // Interpreter
  function truthy(v){ if(typeof v==='string') return v.length>0; return !!v; }
  function cmp(op,a,b){
    if(op==='='||op==='==') return a==b; // 4GL loose compare semantics for this subset
    if(op==='<>') return a!=b;
    if(op==='<') return a<b;
    if(op==='<=') return a<=b;
    if(op==='>') return a>b;
    if(op==='>=') return a>=b;
    throw new Error('Bad compare op '+op);
  }

  function initialValueForType(dataType){
    if(!dataType) return null;
    const upper=String(dataType).toUpperCase();
    if(['INTEGER','INT','DECIMAL','NUMERIC','FLOAT','DOUBLE'].includes(upper)) return 0;
    if(['LOGICAL','BOOLEAN'].includes(upper)) return false;
    if(['CHAR','CHARACTER','STRING'].includes(upper)) return '';
    return null;
  }

  function hasVar(env, name){
    let current=env;
    const key=name.toLowerCase();
    while(current){
      if(Object.prototype.hasOwnProperty.call(current.vars, key)) return true;
      current=current.parent || null;
    }
    return false;
  }

  function getVar(env, name){
    let current=env;
    const key=name.toLowerCase();
    while(current){
      if(Object.prototype.hasOwnProperty.call(current.vars, key)) return current.vars[key];
      current=current.parent || null;
    }
    return null;
  }

  function setVar(env, name, value){
    let current=env;
    const key=name.toLowerCase();
    while(current){
      if(Object.prototype.hasOwnProperty.call(current.vars, key)){
        current.vars[key]=value;
        return;
      }
      current=current.parent || null;
    }
    env.vars[key]=value;
  }

  function normalizeTwoDigitYear(year){
    if(year>=100) return year;
    return year>=70 ? 1900+year : 2000+year;
  }

  function buildUTCDate(year, month, day){
    const date=new Date(Date.UTC(year, month-1, day));
    if(date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day){
      return null;
    }
    return date;
  }

  function parse4GLDate(value){
    if(value==null) return null;
    if(value instanceof Date){
      return isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    if(typeof value==='number' && Number.isFinite(value)){
      const date=new Date(value);
      return isNaN(date.getTime()) ? null : date;
    }
    if(typeof value!=='string') return null;
    const trimmed=value.trim();
    if(!trimmed) return null;

    const isoMatch=trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if(isoMatch){
      const year=parseInt(isoMatch[1],10);
      const month=parseInt(isoMatch[2],10);
      const day=parseInt(isoMatch[3],10);
      return buildUTCDate(year, month, day);
    }

    const genericMatch=trimmed.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/);
    if(genericMatch){
      let first=parseInt(genericMatch[1],10);
      let second=parseInt(genericMatch[2],10);
      let third=parseInt(genericMatch[3],10);

      let year, month, day;
      if(first>31){
        year=first;
        month=second;
        day=third;
      } else if(third>31){
        day=first;
        month=second;
        year=third;
      } else {
        day=first;
        month=second;
        year=third;
      }

      if(year<100) year=normalizeTwoDigitYear(year);
      if(month<1 || month>12) return null;
      if(day<1 || day>31) return null;
      return buildUTCDate(year, month, day);
    }

    const parsed=new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const INT32_MIN=-2147483648;
  const INT32_MAX=2147483647;
  const JULIAN_DAY_BASE_MS=Date.UTC(-4712,0,1);

  function roundHalfAwayFromZero(value){
    if(!Number.isFinite(value)) return value;
    if(value===0) return 0;
    return value>0
      ? Math.floor(value+0.5)
      : Math.ceil(value-0.5);
  }

  function clampToInt32(value){
    if(!Number.isFinite(value)){
      throw new Error('INTEGER() argument is not a finite number');
    }
    const truncated=Math.trunc(value);
    if(truncated<INT32_MIN || truncated>INT32_MAX){
      throw new Error('INTEGER() result is out of range for 32-bit INTEGER');
    }
    return truncated;
  }

  const numericPattern=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

  function toIntegerValue(value){
    if(value==null) return null;

    if(typeof value==='number'){
      if(!Number.isFinite(value)){
        throw new Error('INTEGER() argument is not a finite number');
      }
      const rounded=roundHalfAwayFromZero(value);
      return clampToInt32(rounded);
    }

    if(typeof value==='boolean'){
      return value ? 1 : 0;
    }

    if(typeof value==='string'){
      const trimmed=value.trim();
      if(!numericPattern.test(trimmed)){
        throw new Error(`INTEGER() cannot convert "${value}" to a number`);
      }
      const numericValue=Number(trimmed);
      if(!Number.isFinite(numericValue)){
        throw new Error('INTEGER() argument is not a finite number');
      }
      const rounded=roundHalfAwayFromZero(numericValue);
      return clampToInt32(rounded);
    }

    if(typeof value==='bigint'){
      const numericValue=Number(value);
      if(!Number.isFinite(numericValue)){
        throw new Error('INTEGER() argument is out of range');
      }
      const rounded=roundHalfAwayFromZero(numericValue);
      return clampToInt32(rounded);
    }

    if(value instanceof Date){
      if(isNaN(value.getTime())) return null;
      const utcMs=Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
      const days=Math.floor((utcMs-JULIAN_DAY_BASE_MS)/86400000);
      return clampToInt32(days);
    }

    if(value && typeof value.valueOf==='function' && value.valueOf()!==value){
      return toIntegerValue(value.valueOf());
    }

    if(value && typeof value.__mini4glObjectId==='number'){
      return clampToInt32(roundHalfAwayFromZero(value.__mini4glObjectId));
    }

    throw new Error('INTEGER() does not support this value type');
  }

  function isDateFormatSpec(spec){
    if(typeof spec!=='string') return false;
    const trimmed=spec.trim();
    return /^9{2,4}[^0-9]9{2}[^0-9]9{2,4}$/.test(trimmed);
  }

  function formatDateComponent(value, length){
    const str=String(Math.abs(value)).padStart(length,'0');
    return str.slice(-length);
  }

  function formatDateWithPattern(date, pattern){
    if(!(date instanceof Date) || isNaN(date.getTime())) return '';
    const spec=String(pattern);
    const parts=spec.split(/[^0-9]+/).filter(Boolean);
    const seps=spec.match(/[^0-9]+/g) || [];
    if(parts.length<3) return date.toISOString().slice(0,10);
    const day=date.getUTCDate();
    const month=date.getUTCMonth()+1;
    const year=date.getUTCFullYear();
    const segments=[];

    if(parts[0].length===4){
      segments.push(formatDateComponent(year, parts[0].length));
      segments.push(formatDateComponent(month, parts[1].length));
      segments.push(formatDateComponent(day, parts[2].length));
    } else if(parts[2].length===4){
      segments.push(formatDateComponent(day, parts[0].length));
      segments.push(formatDateComponent(month, parts[1].length));
      segments.push(formatDateComponent(year, parts[2].length));
    } else {
      segments.push(formatDateComponent(day, parts[0].length));
      segments.push(formatDateComponent(month, parts[1].length));
      segments.push(formatDateComponent(year, parts[2].length));
    }

    let formatted='';
    for(let i=0;i<segments.length;i++){
      if(i>0) formatted+=seps[i-1] || '';
      formatted+=segments[i];
    }
    return formatted;
  }

  function formatTimeFromSeconds(value, formatSpec){
    const specRaw = formatSpec == null ? '' : String(formatSpec);
    if(!/^HH:MM(?::SS)?/i.test(specRaw.trimStart())) return undefined;
    const timeMatch = specRaw.match(/HH:MM(?::SS)?/i);
    if(!timeMatch) return undefined;
    if(value==null) return '';
    const numericValue = Number(value);
    if(!Number.isFinite(numericValue)) return '';
    const totalSeconds = Math.trunc(numericValue);
    const secondsPerDay = 24 * 60 * 60;
    const normalizedSeconds = ((totalSeconds % secondsPerDay) + secondsPerDay) % secondsPerDay;
    const hour24 = Math.floor(normalizedSeconds / 3600);
    const minute = Math.floor((normalizedSeconds % 3600) / 60);
    const second = normalizedSeconds % 60;

    const prefix = specRaw.slice(0, timeMatch.index);
    let suffix = specRaw.slice(timeMatch.index + timeMatch[0].length);
    const findMeridiemIndicator = (str)=>{
      for(let i=0;i<str.length;i++){
        const ch=str[i];
        if(ch!=='A' && ch!=='a') continue;
        const prev=i>0 ? str[i-1] : '';
        if(/[A-Za-z]/.test(prev)) continue;
        const next=str[i+1];
        if(next && /[A-Za-z]/.test(next) && next!=='M' && next!=='m' && next!=='.') continue;
        let length=1;
        let cursor=i+1;
        if(str[cursor]==='.'){ length++; cursor++; }
        if(str[cursor]==='M' || str[cursor]==='m'){
          length++; cursor++;
          if(str[cursor]==='.'){ length++; }
        }
        const following=str[i+length];
        if(following && /[A-Za-z]/.test(following) && following!=='.') continue;
        return { index:i, length };
      }
      return null;
    };
    const indicatorMatch = findMeridiemIndicator(suffix);
    let hourDisplay;
    if(indicatorMatch){
      const isPm = hour24 >= 12;
      let adjustedHour = hour24 % 12;
      if(adjustedHour === 0) adjustedHour = 12;
      hourDisplay = adjustedHour < 10 ? ` ${adjustedHour}` : String(adjustedHour);
      if(hour24 === 0){
        hourDisplay = '12';
      }
      if(isPm){
        hourDisplay = adjustedHour < 10 ? ` ${adjustedHour}` : String(adjustedHour);
      }
      const original = suffix.slice(indicatorMatch.index, indicatorMatch.index + indicatorMatch.length);
      const replaced = isPm
        ? original.replace(/A/, 'P').replace(/a/, 'p')
        : original;
      suffix = suffix.slice(0, indicatorMatch.index)
        + replaced
        + suffix.slice(indicatorMatch.index + indicatorMatch.length);
    } else {
      hourDisplay = String(hour24).padStart(2, '0');
    }

    const minuteStr = String(minute).padStart(2, '0');
    const secondStr = String(second).padStart(2, '0');

    let timeSegment = timeMatch[0];
    timeSegment = timeSegment.replace(/HH/i, hourDisplay);
    timeSegment = timeSegment.replace(/MM/i, minuteStr);
    if(/SS/i.test(timeSegment)){
      timeSegment = timeSegment.replace(/SS/i, secondStr);
    }

    return prefix + timeSegment + suffix;
  }

  const evaluateBuiltin = createBuiltinEvaluator({
    formatDisplayValue,
    formatTimeFromSeconds,
    parse4GLDate,
    toIntegerValue
  });

  function formatDisplayValue(value, formatSpec){
    const raw=value==null ? '' : String(value);
    if(formatSpec==null) return raw;
    const spec=String(formatSpec);
    if(isDateFormatSpec(spec)){
      const date=parse4GLDate(value);
      if(date) return formatDateWithPattern(date, spec);
    }
    const explicitWidth=spec.match(/^([xX9#])\((\d+)\)$/);
    if(explicitWidth){
      const width=parseInt(explicitWidth[2],10);
      const align = explicitWidth[1].toUpperCase()==='X' ? 'left' : 'right';
      if(align==='left'){
        return raw.length>width ? raw.slice(0,width) : raw.padEnd(width,' ');
      }
      return raw.length>width ? raw.slice(-width) : raw.padStart(width,' ');
    }
    if(/&+/.test(spec)){
      let cursor=0;
      return spec.replace(/&+/g, match => {
        const width=match.length;
        const slice=raw.slice(cursor, cursor+width);
        cursor+=width;
        return slice.length>=width ? slice : slice.padEnd(width,' ');
      });
    }
    if(/[>9#]/.test(spec)){
      const width = (spec.match(/[>9#]/g) || []).length;
      if(width){
        const truncated = raw.length>width ? raw.slice(-width) : raw;
        return truncated.padStart(width,' ');
      }
    }
    return raw;
  }

  function centerLine(text, width=80){
    const line=String(text ?? '');
    if(line.length>=width) return line;
    const pad=Math.floor((width-line.length)/2);
    return ' '.repeat(pad)+line;
  }

  function lowerFirst(str){ return str ? str.charAt(0).toLowerCase() + str.slice(1) : str; }
  function upperFirst(str){ return str ? str.charAt(0).toUpperCase() + str.slice(1) : str; }
  function normalizeFieldSegment(seg){
    if(!seg) return seg;
    const str=String(seg).trim();
    if(!str) return str;
    const parts=str.split(/[_\s-]+/).filter(Boolean);
    if(parts.length>1){
      return parts
        .map((part, idx)=>{
          const lower=part.toLowerCase();
          if(!lower) return '';
          return idx===0 ? lower : lower.charAt(0).toUpperCase()+lower.slice(1);
        })
        .join('');
    }
    if(str.toUpperCase()===str){
      return str.toLowerCase();
    }
    return lowerFirst(str);
  }

  function getDmmf(env){
    const prisma=env && env.prisma;
    if(!prisma) return null;
    const legacyDmmf=prisma._dmmf;
    if(legacyDmmf && legacyDmmf.modelMap) return legacyDmmf;
    const runtimeModel=prisma._runtimeDataModel;
    if(runtimeModel && runtimeModel.models) return runtimeModel;
    return null;
  }

  function getModelByName(dmmf, modelName){
    if(!dmmf || !modelName) return null;
    if(dmmf.modelMap && dmmf.modelMap[modelName]) return dmmf.modelMap[modelName];
    if(dmmf.models && dmmf.models[modelName]){
      const model=dmmf.models[modelName];
      return { ...model, name: model.name || modelName };
    }
    if(Array.isArray(dmmf.datamodel?.models)){
      return dmmf.datamodel.models.find(m=>m.name===modelName) || null;
    }
    return null;
  }

  function findFieldBySegment(model, segment){
    if(!model) return null;
    const lower=String(segment??'').toLowerCase();
    return model.fields?.find(f=>f.name.toLowerCase()===lower) || null;
  }

  function resolveFieldPath(pathSegments, targetLower, env){
    const path=Array.isArray(pathSegments)? [...pathSegments] : [];
    if(!path.length){
      return { normalizedPath: path, lastField: null, lastModelName: upperFirst(targetLower) };
    }
    const dmmf=getDmmf(env);
    if(!dmmf){
      return { normalizedPath: path.map(normalizeFieldSegment), lastField: null, lastModelName: upperFirst(targetLower) };
    }
    const initialModel=getModelByName(dmmf, upperFirst(targetLower));
    if(!initialModel){
      return { normalizedPath: path.map(normalizeFieldSegment), lastField: null, lastModelName: upperFirst(targetLower) };
    }
    const normalized=[];
    let currentModel=initialModel;
    let lastField=null;
    let lastModelName=currentModel.name;
    for(let i=0;i<path.length;i++){
      const segment=path[i];
      const field=findFieldBySegment(currentModel, segment);
      if(!field){
        const available=(currentModel.fields||[]).map(f=>f.name).sort();
        throw new Error(`Unknown field ${segment} on ${currentModel.name}. Available fields: ${available.join(', ')}`);
      }
      normalized.push(field.name);
      lastField=field;
      lastModelName=currentModel.name;
      const isLast=i===path.length-1;
      if(!isLast){
        if(field.kind!=='object'){
          throw new Error(`Field ${field.name} on ${currentModel.name} is not a relation; cannot access ${path[i+1]}`);
        }
        const nextModel=getModelByName(dmmf, field.type);
        if(!nextModel){
          throw new Error(`Unsupported relation ${field.name} on ${currentModel.name}`);
        }
        currentModel=nextModel;
      }
    }
    return { normalizedPath: normalized, lastField, lastModelName };
  }

  function resolveFieldValue(path, env){
    if(!path || !path.length) return null;
    const [head, ...rest]=path;
    const key=head.toLowerCase();
    let value=getVar(env, key);
    if(typeof value==='undefined' && env.records){ value=env.records[key]; }
    if(rest.length===0) return value ?? null;
    for(const segment of rest){
      if(value==null) return null;
      value=value[normalizeFieldSegment(segment)];
    }
    return value ?? null;
  }

  function normalizeLooseKey(key){
    return String(key ?? '').replace(/[^0-9A-Za-z]/g,'').toLowerCase();
  }

  function lookupLooseRecordValue(record, looseTarget){
    if(!looseTarget) return { found:false, value:null };
    for(const key of Object.keys(record)){
      if(normalizeLooseKey(key)===looseTarget){
        const value=record[key];
        return { found:true, value: value ?? null };
      }
    }
    return { found:false, value:null };
  }

  function lookupFieldInRecords(fieldName, env){
    if(!env || !env.records) return { found:false, value:null };
    const raw=String(fieldName ?? '');
    if(!raw) return { found:false, value:null };
    const normalized=raw.toLowerCase();
    const looseTarget=normalizeLooseKey(raw);
    for(const [bufferName, record] of Object.entries(env.records)){
      if(!record) continue;
      let normalizedPath=null;
      try {
        const resolved=resolveFieldPath([normalized], bufferName, env);
        normalizedPath = resolved && resolved.normalizedPath ? resolved.normalizedPath : null;
      } catch(err){
        normalizedPath=null;
      }
      if(normalizedPath && normalizedPath.length){
        let current=record;
        let missing=false;
        for(const segment of normalizedPath){
          if(current==null || typeof current==='undefined'){ missing=true; break; }
          current=current[segment];
        }
        if(!missing && typeof current!=='undefined'){
          return { found:true, value: current ?? null };
        }
      }
      const loose=lookupLooseRecordValue(record, looseTarget);
      if(loose.found) return loose;
    }
    return { found:false, value:null };
  }

  function stripTargetFromPath(rawPath, targetLower){
    const path=[...rawPath];
    if(path.length && path[0].toLowerCase()===targetLower){ path.shift(); }
    return path;
  }

  function comparisonLeaf(op, value){
    switch(op){
      case '=':
      case '==': return { equals: value };
      case '<>': return { not: value };
      case '<': return { lt: value };
      case '<=': return { lte: value };
      case '>': return { gt: value };
      case '>=': return { gte: value };
      default: return null;
    }
  }

  function buildComparison(path, op, value){
    const leaf=comparisonLeaf(op, value);
    if(!leaf) throw new Error('Unsupported operator '+op+' in WHERE clause');
    let acc=leaf;
    for(let i=path.length-1;i>=0;i--){
      acc={ [normalizeFieldSegment(path[i])]: acc };
    }
    return acc;
  }

  function asLogicalArray(clause, key){
    if(!clause) return [];
    if(clause[key]) return clause[key];
    return [clause];
  }

  function mergeWhereClauses(a,b){
    if(!a) return b;
    if(!b) return a;
    return { AND: [...asLogicalArray(a,'AND'), ...asLogicalArray(b,'AND')] };
  }

  function mergeOrClauses(a,b){
    const arr=[...asLogicalArray(a,'OR'), ...asLogicalArray(b,'OR')];
    return { OR: arr };
  }

  function fieldPathFromNode(node, env, targetLower){
    if(!node) return null;
    if(node.type==='Field'){
      const stripped=stripTargetFromPath(node.path, targetLower);
      if(stripped.length===node.path.length){
        // path did not start with target name; treat as non-field
        return null;
      }
      if(!stripped.length) return null;
      return stripped;
    }
    if(node.type==='Var'){
      if(hasVar(env, node.name)) return null;
      return [node.name];
    }
    return null;
  }

  function literalFromNode(node, env){
    switch(node.type){
      case 'Number': return node.value;
      case 'String': return node.value;
      case 'Var':{
        if(hasVar(env, node.name)) return getVar(env, node.name);
        throw new Error(`Unknown variable ${node.name} in WHERE clause`);
      }
      case 'Field': return resolveFieldValue(node.path, env);
      default:
        throw new Error('Unsupported literal in WHERE clause');
    }
  }

  function flipOperator(op){
    switch(op){
      case '<': return '>';
      case '<=': return '>=';
      case '>': return '<';
      case '>=': return '<=';
      default: return op;
    }
  }

  function buildWhere(node, env, targetLower){
    if(!node) return null;
    switch(node.type){
      case 'Logical':{
        const left=buildWhere(node.left, env, targetLower);
        const right=buildWhere(node.right, env, targetLower);
        if(node.op==='AND') return mergeWhereClauses(left, right);
        if(node.op==='OR') return mergeOrClauses(left, right);
        throw new Error('Unsupported logical operator '+node.op+' in WHERE clause');
      }
      case 'Binary':{
        const leftPath=fieldPathFromNode(node.left, env, targetLower);
        const rightPath=fieldPathFromNode(node.right, env, targetLower);
        if(leftPath && !rightPath){
          const value=literalFromNode(node.right, env);
          const { normalizedPath, lastField, lastModelName }=resolveFieldPath(leftPath, targetLower, env);
          if(lastField && lastField.kind==='object'){
            if(lastField.isList){
              throw new Error(`Field ${lastField.name} on ${lastModelName} is a list relation and cannot be compared to a value`);
            }
            throw new Error(`Field ${lastField.name} on ${lastModelName} is a relation and cannot be compared to a value`);
          }
          return buildComparison(normalizedPath, node.op, value);
        }
        if(rightPath && !leftPath){
          const value=literalFromNode(node.left, env);
          const { normalizedPath, lastField, lastModelName }=resolveFieldPath(rightPath, targetLower, env);
          if(lastField && lastField.kind==='object'){
            if(lastField.isList){
              throw new Error(`Field ${lastField.name} on ${lastModelName} is a list relation and cannot be compared to a value`);
            }
            throw new Error(`Field ${lastField.name} on ${lastModelName} is a relation and cannot be compared to a value`);
          }
          return buildComparison(normalizedPath, flipOperator(node.op), value);
        }
        throw new Error('WHERE clause must compare a field to a value');
      }
      default:
        throw new Error('Unsupported expression in WHERE clause');
    }
  }

  function buildOrderBy(entry, targetLower, env){
    const path=entry.path;
    const stripped=stripTargetFromPath(path, targetLower);
    const effective=stripped.length ? stripped : path;
    if(!effective.length) throw new Error('BY clause requires a field name');
    const { normalizedPath, lastField, lastModelName }=resolveFieldPath(effective, targetLower, env);
    if(lastField && lastField.kind==='object'){
      if(lastField.isList){
        throw new Error(`Cannot ORDER BY list relation ${lastField.name} on ${lastModelName}`);
      }
      throw new Error(`Cannot ORDER BY relation ${lastField.name} on ${lastModelName}`);
    }
    let acc=entry.descending ? 'desc' : 'asc';
    for(let i=normalizedPath.length-1;i>=0;i--){
      acc={ [normalizeFieldSegment(normalizedPath[i])]: acc };
    }
    return acc;
  }

  function relationWhere(targetLower, relationLower, parentRecord){
    if(targetLower==='order' && relationLower==='customer'){
      if(!parentRecord || typeof parentRecord.id==='undefined') throw new Error('Parent Customer record missing id for Order OF Customer');
      return { customerId: parentRecord.id };
    }
    if(targetLower==='customer' && relationLower==='order'){
      if(!parentRecord || typeof parentRecord.customerId==='undefined') throw new Error('Parent Order record missing customerId for Customer OF Order');
      return { id: parentRecord.customerId };
    }
    throw new Error(`Unsupported relation ${targetLower} OF ${relationLower}`);
  }

  function evalExpr(node, env){
    switch(node.type){
      case 'Number': return node.value;
      case 'String': return node.value;
      case 'Var':{
        if(hasVar(env, node.name)) return getVar(env, node.name);
        if(env.records && Object.prototype.hasOwnProperty.call(env.records, node.name)) return env.records[node.name];
        const lookup=lookupFieldInRecords(node.name, env);
        if(lookup.found) return lookup.value;
        return null;
      }
      case 'Unknown': return null;
      case 'Field': return resolveFieldValue(node.path, env);
      case 'Unary':{
        const v=evalExpr(node.arg, env);
        if(node.op==='-') return -Number(v||0);
        if(node.op==='+') return +Number(v||0);
        if(node.op==='NOT') return !truthy(v);
        throw new Error('Unknown unary '+node.op);
      }
      case 'Binary':{
        const l=evalExpr(node.left, env); const r=evalExpr(node.right, env);
        switch(node.op){
          case '+': return (typeof l==='string'||typeof r==='string')? String(l)+String(r) : Number(l)+Number(r);
          case '-': return Number(l)-Number(r);
          case '*': return Number(l)*Number(r);
          case '/': return Number(l)/Number(r);
          default: return cmp(node.op,l,r);
        }
      }
      case 'Logical':{
        if(node.op==='AND') return truthy(evalExpr(node.left,env)) && truthy(evalExpr(node.right,env));
        if(node.op==='OR') return truthy(evalExpr(node.left,env)) || truthy(evalExpr(node.right,env));
        throw new Error('Unknown logical op');
      }
      case 'Call':{
        const args=node.args.map(a=>evalExpr(a,env));
        return evaluateBuiltin(node.name, args, env);
      }
      default: throw new Error('Unknown expr node '+node.type);
    }
  }

  async function runProcedure(node, env){
    if(!env.procedures || !env.procedures[node.name]){
      throw new Error(`Unknown procedure ${node.name}`);
    }
    const proc=env.procedures[node.name];
    if(proc.external){
      throw new Error(`External procedure ${proc.name || node.name} is not supported in this runtime`);
    }
    if(proc.inSuper){
      throw new Error(`Procedure ${proc.name || node.name} declared IN SUPER is not supported`);
    }
    if(proc.prototypeOnly){
      throw new Error(`Procedure ${proc.name || node.name} is declared without an executable body`);
    }
    if(proc.isPrivate){
      let currentEnv = env;
      let allowed = false;
      while(currentEnv){
        if(currentEnv === proc.ownerEnv){
          allowed = true;
          break;
        }
        currentEnv = currentEnv.parent || null;
      }
      if(!allowed){
        throw new Error(`Procedure ${proc.name || node.name} is PRIVATE and cannot be run from this context`);
      }
    }
    const localEnv={
      vars:Object.create(null),
      varDefs:Object.create(null),
      inputs:env.inputs,
      output:env.output,
      prisma:env.prisma,
      records:env.records,
      procedures:env.procedures,
      parent:env
    };
    const params=proc.parameters || [];
    const args=node.args || [];
    if(args.length!==params.length){
      throw new Error(`Procedure ${proc.name || node.name} expects ${params.length} argument(s) but got ${args.length}`);
    }
    const outputBindings=[];
    params.forEach((param, index)=>{
      const arg=args[index];
      const expectedMode=(param.mode || 'INPUT').toUpperCase();
      const argMode=(arg && arg.mode) ? String(arg.mode).toUpperCase() : 'INPUT';
      if(expectedMode==='INPUT'){
        if(!arg) throw new Error(`Missing argument for INPUT parameter ${param.name}`);
        if(arg.mode && argMode!=='INPUT') throw new Error(`Argument ${index+1} for procedure ${proc.name} must use INPUT`);
        const value=evalExpr(arg.expr, env);
        localEnv.vars[param.name]=value;
      } else if(expectedMode==='OUTPUT'){
        if(!arg) throw new Error(`Missing argument for OUTPUT parameter ${param.name}`);
        if(argMode!=='OUTPUT') throw new Error(`Argument ${index+1} for procedure ${proc.name} must use OUTPUT`);
        if(arg.expr.type!=='Var') throw new Error('OUTPUT arguments must be variables');
        const targetName=arg.expr.name;
        outputBindings.push({ local:param.name, target:targetName });
        let initial=initialValueForType(param.dataType);
        if(initial===null && hasVar(env, targetName)){
          initial=getVar(env, targetName);
        }
        localEnv.vars[param.name]=initial;
      } else {
        throw new Error(`Unsupported parameter mode ${param.mode}`);
      }
    });
    await execBlock({type:'Block', body:proc.body}, localEnv);
    for(const binding of outputBindings){
      setVar(env, binding.target, localEnv.vars[binding.local]);
    }
  }

  const runtimeContext={
    setVar,
    evalExpr,
    truthy,
    execBlock,
    initialValueForType,
    formatDisplayValue,
    centerLine,
    buildWhere,
    relationWhere,
    mergeWhereClauses,
    buildOrderBy,
    lowerFirst,
    runProcedure
  };

  async function execStmt(node, env){
    if(!node) return;
    if(node.type==='Empty') return;
    if(node.type==='Block') return execBlock(node, env);
    const executor=STATEMENT_EXECUTORS[node.type];
    if(executor){
      return executor(node, env, runtimeContext);
    }
    throw new Error('Unknown stmt node '+node.type);
  }

  async function execBlock(block, env){
    for(const s of block.body){ await execStmt(s, env); }
  }

  function ensureBrowserOutputSink(){
    if(typeof document === 'undefined') return null;
    let wrapper=document.querySelector('[data-mini4gl-output]');
    let pre=null;
    if(!wrapper){
      wrapper=document.createElement('section');
      wrapper.dataset.mini4glOutput='';
      wrapper.style.position='fixed';
      wrapper.style.bottom='1rem';
      wrapper.style.right='1rem';
      wrapper.style.maxWidth='min(420px, 90vw)';
      wrapper.style.maxHeight='50vh';
      wrapper.style.background='rgba(20,20,20,0.92)';
      wrapper.style.color='#f0f0f0';
      wrapper.style.borderRadius='8px';
      wrapper.style.boxShadow='0 8px 24px rgba(0,0,0,0.35)';
      wrapper.style.fontFamily='"Fira Code", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      wrapper.style.zIndex='9999';

      const heading=document.createElement('header');
      heading.textContent='Mini 4GL - Sortie';
      heading.style.padding='0.6rem 0.75rem';
      heading.style.fontSize='0.9rem';
      heading.style.fontWeight='600';
      heading.style.borderBottom='1px solid rgba(255,255,255,0.12)';
      wrapper.appendChild(heading);

      pre=document.createElement('pre');
      pre.style.margin='0';
      pre.style.padding='0.75rem';
      pre.style.fontSize='0.85rem';
      pre.style.lineHeight='1.4';
      pre.style.overflow='auto';
      pre.style.maxHeight='calc(50vh - 2.5rem)';
      wrapper.appendChild(pre);

      document.body.appendChild(wrapper);
    } else {
      pre=wrapper.querySelector('pre');
      if(!pre){
        pre=document.createElement('pre');
        pre.style.margin='0';
        pre.style.padding='0.75rem';
        pre.style.fontSize='0.85rem';
        pre.style.lineHeight='1.4';
        pre.style.overflow='auto';
        pre.style.maxHeight='calc(50vh - 2.5rem)';
        wrapper.appendChild(pre);
      }
    }
    pre.textContent='';
    return (line)=>{
      pre.textContent += String(line) + '\n';
      pre.scrollTop = pre.scrollHeight;
    };
  }

  async function interpret4GL(source, opts={}){
    const tokens=tokenize(source);
    const parser=createParser(tokens, statementRegistry);
    const ast=parser.parseProgram();
    const outputs=[];
    const browserSink = !opts.onOutput ? ensureBrowserOutputSink() : null;
    const callback = typeof opts.onOutput === 'function'
      ? opts.onOutput
      : (browserSink || (typeof console !== 'undefined' && typeof console.log === 'function'
          ? line => console.log(line)
          : null));
    let prismaClient;
    if(Object.prototype.hasOwnProperty.call(opts, 'prisma')){
      prismaClient = opts.prisma;
    } else {
      if(!triedDefaultPrisma && typeof require === 'function'){
        triedDefaultPrisma = true;
        try {
          const dbModule = require('./src/db');
          defaultPrismaClient = dbModule && dbModule.prisma ? dbModule.prisma : null;
          defaultPrismaEnsureReady = dbModule && typeof dbModule.ensurePrismaReady === 'function'
            ? () => dbModule.ensurePrismaReady()
            : null;
        } catch(err){
          defaultPrismaClient = null;
          defaultPrismaEnsureReady = null;
        }
      }
      prismaClient = defaultPrismaClient;
    }
    const prismaReadyPromise = opts.prismaReady
      ? opts.prismaReady
      : (prismaClient && defaultPrismaClient && prismaClient===defaultPrismaClient && defaultPrismaEnsureReady
        ? defaultPrismaEnsureReady()
        : null);
    const env={
      vars:Object.create(null),
      varDefs:Object.create(null),
      inputs:[...(opts.inputs||[])],
      output:null,
      prisma: prismaClient || null,
      records: Object.create(null),
      procedures:Object.create(null),
      parent:null
    };
    env.output=(line)=>{
      if(callback) callback.call(env, String(line));
      outputs.push(String(line));
    };
    if(prismaReadyPromise){
      await prismaReadyPromise;
    }
    for(const stmt of ast.body){ await execStmt(stmt, env); }
    return { output: outputs, env, ast };
  }

  // Export
  const api = { interpret4GL };
  if(typeof module!== 'undefined' && module.exports){ module.exports=api; }
  else { global.Mini4GL=api; }

})(typeof window!== 'undefined' ? window : globalThis);

/* -------------------------- Quick demo --------------------------
const program = `
  /* Countdown *\/
  ASSIGN n = 3.
  DO WHILE n > 0:
    DISPLAY "tick", n.
    n = n - 1.
  END.
  IF n = 0 THEN DISPLAY "done".
`;

Mini4GL.interpret4GL(program, { onOutput: console.log });
-----------------------------------------------------------------*/
