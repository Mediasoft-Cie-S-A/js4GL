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
  - Builtins: UPPER(s), LOWER(s), LENGTH(s), INT(n), FLOAT(n), PRINT(...) alias of DISPLAY

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
  const KEYWORDS = new Set([
    'ASSIGN',
    'DISPLAY',
    'PRINT',
    'INPUT',
    'IF',
    'THEN',
    'ELSE',
    'END',
    'DO',
    'WHILE',
    'REPEAT',
    'LEAVE',
    'NEXT',
    'AND',
    'OR',
    'NOT',
    'FOR',
    'EACH',
    'WHERE',
    'BY',
    'OF',
    'FIND',
    'FIRST',
    'ERROR',
    'DEFINE',
    'VARIABLE',
    'AS',
    'NO',
    'UNDO',
    'INIT',
    'LABEL',
    'FORMAT',
    'WITH',
    'CENTERED',
    'PROCEDURE',
    'RUN',
    'PARAMETER',
    'OUTPUT'
  ]);

  let defaultPrismaClient;
  let defaultPrismaEnsureReady;
  let triedDefaultPrisma = false;

  function isAlpha(ch){return /[A-Za-z_]/.test(ch);} 
  function isAlnum(ch){return /[A-Za-z0-9_]/.test(ch);} 
  function isDigit(ch){return /[0-9]/.test(ch);} 

  function tokenize(src){
    const tokens=[]; let i=0; const n=src.length;
    const push=(type,value)=>tokens.push({type,value,pos:i});
    while(i<n){
      let ch=src[i];
      // skip whitespace
      if(/\s/.test(ch)){ i++; continue; }
      // comments: /* ... */ and // ...
      if(ch==='/' && src[i+1]==='*'){ i+=2; while(i<n && !(src[i]==='*' && src[i+1]==='/')) i++; i+=2; continue; }
      if(ch==='/' && src[i+1]==='/'){ i+=2; while(i<n && src[i]!=="\n") i++; continue; }
      if(ch==='?'){ push('UNKNOWN', null); i++; continue; }
      // strings: "..."
      if(ch==='"'){
        i++; let start=i; let s=""; let esc=false;
        while(i<n){
          let c=src[i++];
          if(esc){ s+=c; esc=false; continue; }
          if(c==='\\'){ esc=true; continue; }
          if(c==='"'){ break; }
          s+=c;
        }
        push('STRING', s);
        continue;
      }
      // numbers
      if(isDigit(ch) || (ch==='.' && isDigit(src[i+1]))){
        let start=i; i++;
        while(i<n && (isDigit(src[i]) || src[i]==='.')) i++;
        push('NUMBER', parseFloat(src.slice(start,i)));
        continue;
      }
      // identifiers / keywords
      if(isAlpha(ch)){
        let start=i; i++;
        while(i<n && isAlnum(src[i])) i++;
        const raw=src.slice(start,i); const upper=raw.toUpperCase();
        const opKeywordMap={ NE:'<>', EQ:'=', GE:'>=', LE:'<=' };
        if(Object.prototype.hasOwnProperty.call(opKeywordMap, upper)){
          push('OP', opKeywordMap[upper]);
        } else if(KEYWORDS.has(upper)){
          push(upper, upper);
        } else {
          push('IDENT', raw);
        }
        continue;
      }
      // two-char operators
      const two=src.slice(i,i+2);
      if(['<=','>=','<>','=='].includes(two)){ push('OP', two); i+=2; continue; }
      // single-char tokens
      const singleMap = {
        '+':'OP','-':'OP','*':'OP','/':'OP','=':'OP','<':'OP','>':'OP','(':'LPAREN',')':'RPAREN',',':'COMMA',':':'COLON','.' :'DOT'
      };
      if(singleMap[ch]){ push(singleMap[ch], ch); i++; continue; }

      throw new SyntaxError(`Unexpected character '${ch}' at ${i}`);
    }
    tokens.push({type:'EOF', value:null, pos:i});
    return tokens;
  }

  // Parser helpers
  function Parser(tokens){ this.toks=tokens; this.i=0; }
  Parser.prototype.peek=function(){ return this.toks[this.i]; };
  Parser.prototype.eat=function(type){
    const t=this.peek();
    if(type && t.type!==type) throw new SyntaxError(`Expected ${type} but got ${t.type}`);
    this.i++; return t;
  };
  Parser.prototype.match=function(...types){
    const t=this.peek(); if(types.includes(t.type)){ this.i++; return t; } return null;
  };

  // Grammar
  Parser.prototype.parseProgram=function(){
    const body=[];
    while(this.peek().type!=='EOF'){
      // allow stray DOT as separator
      if(this.match('DOT')) continue;
      body.push(this.parseStatement());
    }
    return { type:'Program', body };
  };

  Parser.prototype.parseStatement=function(){
    const t=this.peek();
    switch(t.type){
      case 'ASSIGN':
      case 'IDENT': return this.parseAssignLike();
      case 'DEFINE': return this.parseDefineStatement();
      case 'PROCEDURE': return this.parseProcedure();
      case 'RUN': return this.parseRun();
      case 'DISPLAY':
      case 'PRINT': return this.parseDisplay();
      case 'INPUT': return this.parseInput();
      case 'IF': return this.parseIf();
      case 'DO': return this.parseDo();
      case 'REPEAT': return this.parseRepeat();
      case 'WHILE': return this.parseWhile();
      case 'FOR': return this.parseForEach();
      case 'FIND': return this.parseFind();
      case 'END': this.eat('END'); this.optionalDot(); return {type:'Empty'};
      default:
        throw new SyntaxError(`Unexpected token ${t.type}`);
    }
  };

  Parser.prototype.optionalDot=function(){ if(this.match('DOT')) return; };

  Parser.prototype.parseAssignLike=function(){
    // supports: ASSIGN x = expr . | x = expr .
    if(this.match('ASSIGN')){ /* fallthrough to identifier */ }
    const id=this.eat('IDENT').value;
    const assignTok=this.eat('OP');
    if(assignTok.value !== '=') throw new SyntaxError(`Expected '=' but got ${assignTok.value}`);
    const value=this.parseExpr();
    this.optionalDot();
    return { type:'Assign', id: id.toLowerCase(), value };
  };

  Parser.prototype.parseDefineStatement=function(){
    this.eat('DEFINE');
    const next=this.peek();
    if(next.type==='VARIABLE'){
      this.eat('VARIABLE');
      const details=this.parseDefineDetails();
      this.optionalDot();
      return { type:'DefineVariable', ...details };
    }
    if(next.type==='INPUT' || next.type==='OUTPUT'){
      const mode=this.eat(next.type).type;
      this.eat('PARAMETER');
      const details=this.parseDefineDetails();
      this.optionalDot();
      return { type:'DefineParameter', mode, ...details };
    }
    throw new SyntaxError('Unsupported DEFINE form');
  };

  Parser.prototype.parseDefineDetails=function(){
    const id=this.eat('IDENT').value;
    let dataType=null;
    if(this.match('AS')){
      const typeTok=this.peek();
      if(typeTok.type==='IDENT'){ dataType=this.eat('IDENT').value.toUpperCase(); }
      else { dataType=this.eat(typeTok.type).value || typeTok.type; dataType=String(dataType).toUpperCase(); }
    }
    let init=null;
    let noUndo=false;
    while(true){
      const next=this.peek();
      if(next.type==='INIT'){
        this.eat('INIT');
        if(this.peek().type==='OP' && this.peek().value==='=') this.eat('OP');
        init=this.parseExpr();
        continue;
      }
      if(next.type==='NO'){
        this.eat('NO');
        if(this.peek().type==='OP' && this.peek().value==='-') this.eat('OP');
        const undoTok=this.peek();
        if(undoTok.type==='UNDO' || (undoTok.type==='IDENT' && undoTok.value.toUpperCase()==='UNDO')){
          this.eat(undoTok.type);
        }
        noUndo=true;
        continue;
      }
      break;
    }
    return { id:id.toLowerCase(), dataType, init, noUndo };
  };

  function isExprStartToken(tok){
    if(!tok) return false;
    if(['IDENT','NUMBER','STRING','UNKNOWN','LPAREN'].includes(tok.type)) return true;
    if(tok.type==='OP' && (tok.value==='+' || tok.value==='-')) return true;
    if(tok.type==='NOT') return true;
    return false;
  }

  Parser.prototype.parseDisplay=function(){
    this.eat(this.peek().type); // DISPLAY or PRINT
    const items=[];
    while(true){
      const expr=this.parseExpr();
      const meta={ expr };
      while(true){
        const next=this.peek();
        if(next.type==='LABEL'){
          this.eat('LABEL');
          meta.label=this.parseExpr();
          continue;
        }
        if(next.type==='FORMAT'){
          this.eat('FORMAT');
          meta.format=this.parseExpr();
          continue;
        }
        break;
      }
      items.push(meta);
      if(this.match('COMMA')) continue;
      const next=this.peek();
      if(isExprStartToken(next)) continue;
      break;
    }
    const withOptions=[];
    if(this.match('WITH')){
      while(true){
        const next=this.peek();
        if(next.type==='CENTERED'){
          this.eat('CENTERED');
          withOptions.push('CENTERED');
        } else if(next.type==='IDENT'){
          withOptions.push(this.eat('IDENT').value.toUpperCase());
        } else {
          break;
        }
        if(!this.match('COMMA')) break;
      }
    }
    this.optionalDot();
    return { type:'Display', items, withOptions };
  };

  Parser.prototype.parseInput=function(){
    this.eat('INPUT');
    const id=this.eat('IDENT').value.toLowerCase();
    this.optionalDot();
    return { type:'Input', id };
  };

  Parser.prototype.parseIf=function(){
    this.eat('IF');
    const test=this.parseExpr();
    this.eat('THEN');
    const consequent=this.parsePossiblyBlock();
    let alternate=null;
    if(this.match('ELSE')){
      alternate=this.parsePossiblyBlock();
    }
    // If bodies were a single statement followed by DOT, it's already eaten; if they were blocks, END. handled inside.
    return { type:'If', test, consequent, alternate };
  };

  Parser.prototype.parseDo=function(){
    this.eat('DO');
    let whileExpr=null;
    if(this.match('WHILE')){ whileExpr=this.parseExpr(); }
    if(this.match('COLON')){ /* block follows */ }
    const body=this.parseBlockStatements();
    this.eat('END'); this.optionalDot();
    return { type:'Do', whileExpr, body };
  };

  Parser.prototype.parseRepeat=function(){
    this.eat('REPEAT');
    let whileExpr=null;
    if(this.match('WHILE')){ whileExpr=this.parseExpr(); }
    if(this.match('COLON')){ /* block follows */ }
    const body=this.parseBlockStatements();
    this.eat('END'); this.optionalDot();
    return { type:'Repeat', whileExpr, body };
  };

  Parser.prototype.parseWhile=function(){
    this.eat('WHILE');
    const test=this.parseExpr();
    this.eat('DO');
    if(this.match('COLON')){ /* block follows */ }
    const body=this.parseBlockStatements();
    this.eat('END'); this.optionalDot();
    return { type:'While', test, body };
  };

  Parser.prototype.parsePossiblyBlock=function(){
    // Either a single statement terminated by DOT, or a block starting with optional ':' and ending with END.
    if(this.match('COLON')){
      const body=this.parseBlockStatements();
      this.eat('END'); this.optionalDot();
      return { type:'Block', body };
    }
    // Single statement
    const stmt=this.parseStatement();
    return { type:'Block', body:[stmt] };
  };

  Parser.prototype.parseBlockStatements=function(){
    const body=[];
    while(this.peek().type!=='END' && this.peek().type!=='EOF'){
      if(this.match('DOT')) continue;
      body.push(this.parseStatement());
    }
    return body;
  };

  Parser.prototype.parseProcedure=function(){
    this.eat('PROCEDURE');
    const name=this.eat('IDENT').value.toLowerCase();
    if(this.match('COLON')){ /* optional colon before body */ }
    const body=[];
    const parameters=[];
    while(true){
      const next=this.peek();
      if(next.type==='EOF'){ throw new SyntaxError(`Unexpected EOF inside PROCEDURE ${name}`); }
      if(next.type==='END'){
        const lookahead=this.toks[this.i+1];
        if(lookahead && lookahead.type==='PROCEDURE'){
          this.eat('END');
          this.eat('PROCEDURE');
          this.optionalDot();
          break;
        }
      }
      if(this.match('DOT')) continue;
      const stmt=this.parseStatement();
      if(stmt.type==='DefineParameter'){
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
    return { type:'Procedure', name, parameters, body };
  };

  Parser.prototype.parseRun=function(){
    this.eat('RUN');
    const name=this.eat('IDENT').value.toLowerCase();
    const args=[];
    if(this.match('LPAREN')){
      if(this.peek().type!=='RPAREN'){
        while(true){
          let mode=null;
          const modeTok=this.peek();
          if(modeTok.type==='INPUT' || modeTok.type==='OUTPUT'){
            mode=this.eat(modeTok.type).type;
          }
          const expr=this.parseExpr();
          args.push({ mode: mode || null, expr });
          if(!this.match('COMMA')) break;
        }
      }
      this.eat('RPAREN');
    }
    this.optionalDot();
    return { type:'Run', name, args };
  };

  Parser.prototype.parseFieldPath=function(){
    const segments=[this.eat('IDENT').value];
    while(true){
      const dotTok=this.peek();
      const nextTok=this.toks[this.i+1];
      if(dotTok.type==='DOT' && nextTok && nextTok.type==='IDENT'){
        const nextStart=nextTok.pos - nextTok.value.length;
        if(nextStart===dotTok.pos+1){
          this.eat('DOT');
          segments.push(this.eat('IDENT').value);
          continue;
        }
      }
      break;
    }
    return segments;
  };

  Parser.prototype.parseForEach=function(){
    this.eat('FOR');
    this.eat('EACH');
    const target=this.eat('IDENT').value;
    let relation=null;
    if(this.match('OF')){
      relation=this.eat('IDENT').value;
    }
    let where=null;
    if(this.match('WHERE')){
      where=this.parseExpr();
    }
    const orderBy=[];
    while(this.match('BY')){
      orderBy.push(this.parseFieldPath());
    }
    this.eat('COLON');
    const body=this.parseBlockStatements();
    this.eat('END'); this.optionalDot();
    return { type:'ForEach', target, relation, where, orderBy, body };
  };

  Parser.prototype.parseFind=function(){
    this.eat('FIND');
    let qualifier=null;
    if(this.match('FIRST')){ qualifier='FIRST'; }
    const target=this.eat('IDENT').value;
    let relation=null;
    if(this.match('OF')){
      relation=this.eat('IDENT').value;
    }
    let where=null;
    if(this.match('WHERE')){
      where=this.parseExpr();
    }
    let noError=false;
    if(this.match('NO')){
      if(this.peek().type==='OP' && this.peek().value==='-') this.eat('OP');
      const errTok=this.peek();
      if(errTok.type==='ERROR' || (errTok.type==='IDENT' && String(errTok.value).toUpperCase()==='ERROR')){
        this.eat(errTok.type);
      }
      noError=true;
    }
    this.optionalDot();
    return { type:'Find', target, relation, where, qualifier, noError };
  };

  // Expressions: precedence climbing
  Parser.prototype.parseExpr=function(){
    return this.parseOr();
  };
  Parser.prototype.parseOr=function(){
    let node=this.parseAnd();
    while(true){
      if(this.match('OR')){ node={type:'Logical', op:'OR', left:node, right:this.parseAnd()}; }
      else break;
    }
    return node;
  };
  Parser.prototype.parseAnd=function(){
    let node=this.parseNot();
    while(true){
      if(this.match('AND')){ node={type:'Logical', op:'AND', left:node, right:this.parseNot()}; }
      else break;
    }
    return node;
  };
  Parser.prototype.parseNot=function(){
    if(this.match('NOT')) return {type:'Unary', op:'NOT', arg:this.parseNot()};
    return this.parseCompare();
  };
  Parser.prototype.parseCompare=function(){
    let node=this.parseAdd();
    while(true){
      const t=this.peek();
      if(t.type==='OP' && ['=','<>','<','<=','>','>=','=='].includes(t.value)){
        this.eat('OP');
        node={type:'Binary', op:t.value, left:node, right:this.parseAdd()};
      } else break;
    }
    return node;
  };
  Parser.prototype.parseAdd=function(){
    let node=this.parseMul();
    while(true){
      const t=this.peek();
      if(t.type==='OP' && (t.value==='+'||t.value==='-')){ this.eat('OP'); node={type:'Binary', op:t.value, left:node, right:this.parseMul()}; }
      else break;
    }
    return node;
  };
  Parser.prototype.parseMul=function(){
    let node=this.parseUnary();
    while(true){
      const t=this.peek();
      if(t.type==='OP' && (t.value==='*'||t.value==='/')){ this.eat('OP'); node={type:'Binary', op:t.value, left:node, right:this.parseUnary()}; }
      else break;
    }
    return node;
  };
  Parser.prototype.parseUnary=function(){
    const t=this.peek();
    if(t.type==='OP' && (t.value==='+'||t.value==='-')){ this.eat('OP'); return {type:'Unary', op:t.value, arg:this.parseUnary()}; }
    return this.parsePrimary();
  };
  Parser.prototype.parsePrimary=function(){
    const t=this.peek();
    if(t.type==='NUMBER'){ this.eat('NUMBER'); return {type:'Number', value:t.value}; }
    if(t.type==='STRING'){ this.eat('STRING'); return {type:'String', value:t.value}; }
    if(t.type==='IDENT'){
      const segments=[this.eat('IDENT').value];
      while(true){
        const dotTok=this.peek();
        const nextTok=this.toks[this.i+1];
        if(dotTok.type==='DOT' && nextTok && nextTok.type==='IDENT'){
          const nextStart=nextTok.pos - nextTok.value.length;
          if(nextStart===dotTok.pos+1){
            this.eat('DOT');
            segments.push(this.eat('IDENT').value);
            continue;
          }
        }
        break;
      }
      if(segments.length===1 && this.match('LPAREN')){
        const args=[]; if(this.peek().type!=='RPAREN'){ args.push(this.parseExpr()); while(this.match('COMMA')) args.push(this.parseExpr()); }
        this.eat('RPAREN');
        return { type:'Call', name:segments[0].toUpperCase(), args };
      }
      if(segments.length>1){
        return { type:'Field', path: segments };
      }
      return { type:'Var', name:segments[0].toLowerCase() };
    }
    if(this.match('UNKNOWN')){ return { type:'Unknown' }; }
    if(this.match('LPAREN')){ const e=this.parseExpr(); this.eat('RPAREN'); return e; }
    throw new SyntaxError(`Unexpected token in expression: ${t.type}`);
  };

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
    const dmmf=prisma._dmmf;
    if(dmmf && dmmf.modelMap) return dmmf;
    return null;
  }

  function getModelByName(dmmf, modelName){
    if(!dmmf || !modelName) return null;
    if(dmmf.modelMap && dmmf.modelMap[modelName]) return dmmf.modelMap[modelName];
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

  function buildOrderBy(path, targetLower, env){
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
    let acc='asc';
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
        switch(node.name){
          case 'UPPER': return String(args[0]??'').toUpperCase();
          case 'LOWER': return String(args[0]??'').toLowerCase();
          case 'LENGTH': return String(args[0]??'').length;
          case 'INT': return parseInt(args[0]??0,10);
          case 'FLOAT': return parseFloat(args[0]??0);
          case 'MONTH':{
            const date=parse4GLDate(args[0]);
            return date ? date.getUTCMonth()+1 : null;
          }
          case 'ENTRY':{
            const indexRaw=args[0];
            const listValue=args[1];
            const delimiterArg=args.length>=3 ? args[2] : null;
            const idx=Math.trunc(Number(indexRaw));
            if(!Number.isFinite(idx) || idx<1) return '';
            const delimiter = delimiterArg==null || delimiterArg=== '' ? ',' : String(delimiterArg);
            const listString=String(listValue ?? '');
            const entries=listString.length ? listString.split(delimiter) : [''];
            const entry=entries[idx-1];
            return typeof entry==='undefined' ? '' : String(entry).trim();
          }
          case 'PRINT': // allow PRINT() function-style
            env.output(String(args.map(String).join(' '))); return null;
          default:
            throw new Error(`Unknown function ${node.name}`);
        }
      }
      default: throw new Error('Unknown expr node '+node.type);
    }
  }

  async function runProcedure(node, env){
    if(!env.procedures || !env.procedures[node.name]){
      throw new Error(`Unknown procedure ${node.name}`);
    }
    const proc=env.procedures[node.name];
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

  async function execStmt(node, env){
    switch(node.type){
      case 'Empty': return;
      case 'Assign': setVar(env, node.id, evalExpr(node.value,env)); return;
      case 'DefineVariable':{
        const value = node.init ? evalExpr(node.init, env) : initialValueForType(node.dataType);
        env.vars[node.id]=value;
        if(env.varDefs) env.varDefs[node.id]={ dataType: node.dataType, noUndo: node.noUndo };
        return;
      }
      case 'DefineParameter':{
        // Parameters are handled during PROCEDURE parsing/execution; they should not execute at runtime.
        return;
      }
      case 'Procedure':{
        if(!env.procedures) env.procedures=Object.create(null);
        env.procedures[node.name]=node;
        return;
      }
      case 'Run':{
        return runProcedure(node, env);
      }
      case 'Display':{
        const parts=node.items.map(item=>{
          const value=evalExpr(item.expr, env);
          const formatted=formatDisplayValue(value, item.format ? evalExpr(item.format, env) : null);
          if(item.label){
            const labelVal=evalExpr(item.label, env);
            const labelStr=labelVal==null? '' : String(labelVal);
            if(labelStr.length){
              return `${labelStr} ${formatted}`.trim();
            }
          }
          return formatted;
        });
        let line=parts.join(' ');
        if(node.withOptions && node.withOptions.some(opt=>String(opt).toUpperCase()==='CENTERED')){
          line=centerLine(line);
        }
        env.output(line);
        return;
      }
      case 'Input':{
        const val = env.inputs.length? env.inputs.shift() : null;
        setVar(env, node.id, val); return;
      }
      case 'If':{
        if(truthy(evalExpr(node.test,env))) await execBlock(node.consequent,env);
        else if(node.alternate) await execBlock(node.alternate,env);
        return;
      }
      case 'Do':{
        if(node.whileExpr){
          while(truthy(evalExpr(node.whileExpr,env))){
            await execBlock({type:'Block', body:node.body}, env);
          }
        } else {
          await execBlock({type:'Block', body:node.body}, env);
        }
        return;
      }
      case 'Repeat':{
        if(node.whileExpr){
          while(truthy(evalExpr(node.whileExpr,env))){ await execBlock({type:'Block', body:node.body}, env); }
        } else {
          // unconditional repeat -> avoid infinite loop; user can extend with LEAVE/NEXT
          throw new Error('REPEAT without WHILE not supported in this mini-interpreter');
        }
        return;
      }
      case 'While':{
        while(truthy(evalExpr(node.test,env))){ await execBlock({type:'Block', body:node.body}, env); }
        return;
      }
      case 'Block': return execBlock(node, env);
      case 'ForEach':{
        const prisma=env.prisma;
        if(!prisma) throw new Error('Prisma client is required for FOR EACH statements');
        const targetLower=node.target.toLowerCase();
        const delegateName=lowerFirst(node.target);
        const delegate=prisma[delegateName];
        if(!delegate || typeof delegate.findMany!=='function'){
          throw new Error(`Prisma model ${node.target} is not available`);
        }
        const query={};
        const whereClause=buildWhere(node.where, env, targetLower);
        if(whereClause) query.where=whereClause;
        if(node.relation){
          const parentKey=node.relation.toLowerCase();
          const parentRecord=env.records ? env.records[parentKey] : undefined;
          if(!parentRecord) throw new Error(`No active record for ${node.relation} to satisfy FOR EACH ${node.target} OF ${node.relation}`);
          const relationClause=relationWhere(targetLower, parentKey, parentRecord);
          query.where=mergeWhereClauses(query.where || null, relationClause);
        }
        if(node.orderBy && node.orderBy.length){
          query.orderBy=node.orderBy.map(path=>buildOrderBy(path, targetLower, env));
        }
        const results=await delegate.findMany(query);
        const hadRecord=env.records && Object.prototype.hasOwnProperty.call(env.records, targetLower);
        const hadVar=Object.prototype.hasOwnProperty.call(env.vars, targetLower);
        const prevRecord=hadRecord ? env.records[targetLower] : undefined;
        const prevVar=hadVar ? env.vars[targetLower] : undefined;
        if(env.records) env.records[targetLower]=null;
        for(const row of results){
          if(env.records) env.records[targetLower]=row;
          env.vars[targetLower]=row;
          await execBlock({type:'Block', body:node.body}, env);
        }
        if(env.records){
          if(hadRecord) env.records[targetLower]=prevRecord;
          else delete env.records[targetLower];
        }
        if(hadVar) env.vars[targetLower]=prevVar;
        else delete env.vars[targetLower];
        return;
      }
      case 'Find':{
        const prisma=env.prisma;
        if(!prisma) throw new Error('Prisma client is required for FIND statements');
        const targetLower=node.target.toLowerCase();
        const delegateName=lowerFirst(node.target);
        const delegate=prisma[delegateName];
        if(!delegate || typeof delegate.findFirst!=='function'){
          throw new Error(`Prisma model ${node.target} is not available`);
        }
        const query={};
        const whereClause=buildWhere(node.where, env, targetLower);
        if(whereClause) query.where=whereClause;
        if(node.relation){
          const parentKey=node.relation.toLowerCase();
          const parentRecord=env.records ? env.records[parentKey] : undefined;
          if(!parentRecord){
            throw new Error(`No active record for ${node.relation} to satisfy FIND ${node.target} OF ${node.relation}`);
          }
          const relationClause=relationWhere(targetLower, parentKey, parentRecord);
          query.where=mergeWhereClauses(query.where || null, relationClause);
        }
        const record=await delegate.findFirst(query);
        if(!record){
          if(node.noError){
            if(env.records) env.records[targetLower]=null;
            env.vars[targetLower]=null;
            return;
          }
          throw new Error(`FIND ${node.target} failed: no record found`);
        }
        if(env.records) env.records[targetLower]=record;
        env.vars[targetLower]=record;
        return;
      }
      default:
        throw new Error('Unknown stmt node '+node.type);
    }
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
    const parser=new Parser(tokens);
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
