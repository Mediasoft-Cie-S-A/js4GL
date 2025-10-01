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
  - Expressions: + - * /, parentheses, comparisons (=, <>, <, <=, >, >=), logical AND/OR/NOT
  - Strings with double quotes, numbers (int/float).
  - Builtins: UPPER(s), LOWER(s), LENGTH(s), INT(n), FLOAT(n), PRINT(...) alias of DISPLAY

  Not implemented (you can extend): database buffers, FOR EACH, FIND, TRANSACTION, temp-tables, procedures, triggers, frames.

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
    'ASSIGN','DISPLAY','PRINT','INPUT','IF','THEN','ELSE','END','DO','WHILE','REPEAT','LEAVE','NEXT','AND','OR','NOT'
  ]);

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
        if(KEYWORDS.has(upper)) push(upper, upper);
        else push('IDENT', raw);
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
      case 'DISPLAY':
      case 'PRINT': return this.parseDisplay();
      case 'INPUT': return this.parseInput();
      case 'IF': return this.parseIf();
      case 'DO': return this.parseDo();
      case 'REPEAT': return this.parseRepeat();
      case 'WHILE': return this.parseWhile();
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

  Parser.prototype.parseDisplay=function(){
    this.eat(this.peek().type); // DISPLAY or PRINT
    const items=[this.parseExpr()];
    while(this.match('COMMA')) items.push(this.parseExpr());
    this.optionalDot();
    return { type:'Display', items };
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
      const name=this.eat('IDENT').value;
      // function call? IDENT '(' args ')'
      if(this.match('LPAREN')){
        const args=[]; if(this.peek().type!=='RPAREN'){ args.push(this.parseExpr()); while(this.match('COMMA')) args.push(this.parseExpr()); }
        this.eat('RPAREN');
        return { type:'Call', name:name.toUpperCase(), args };
      }
      return { type:'Var', name:name.toLowerCase() };
    }
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

  function evalExpr(node, env){
    switch(node.type){
      case 'Number': return node.value;
      case 'String': return node.value;
      case 'Var': return env.vars[node.name] ?? null;
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
          case 'PRINT': // allow PRINT() function-style
            env.output(String(args.map(String).join(' '))); return null;
          default:
            throw new Error(`Unknown function ${node.name}`);
        }
      }
      default: throw new Error('Unknown expr node '+node.type);
    }
  }

  function execStmt(node, env){
    switch(node.type){
      case 'Empty': return;
      case 'Assign': env.vars[node.id]=evalExpr(node.value,env); return;
      case 'Display':{
        const parts=node.items.map(e=>evalExpr(e,env));
        env.output(parts.join(' ')); return;
      }
      case 'Input':{
        const val = env.inputs.length? env.inputs.shift() : null;
        env.vars[node.id]=val; return;
      }
      case 'If':{
        if(truthy(evalExpr(node.test,env))) execBlock(node.consequent,env);
        else if(node.alternate) execBlock(node.alternate,env);
        return;
      }
      case 'Do':{
        if(node.whileExpr){
          while(truthy(evalExpr(node.whileExpr,env))){
            execBlock({type:'Block', body:node.body}, env);
          }
        } else {
          execBlock({type:'Block', body:node.body}, env);
        }
        return;
      }
      case 'Repeat':{
        if(node.whileExpr){
          while(truthy(evalExpr(node.whileExpr,env))){ execBlock({type:'Block', body:node.body}, env); }
        } else {
          // unconditional repeat -> avoid infinite loop; user can extend with LEAVE/NEXT
          throw new Error('REPEAT without WHILE not supported in this mini-interpreter');
        }
        return;
      }
      case 'While':{
        while(truthy(evalExpr(node.test,env))){ execBlock({type:'Block', body:node.body}, env); }
        return;
      }
      case 'Block': return execBlock(node, env);
      default:
        throw new Error('Unknown stmt node '+node.type);
    }
  }

  function execBlock(block, env){
    for(const s of block.body){ execStmt(s, env); }
  }

  function interpret4GL(source, opts={}){
    const tokens=tokenize(source);
    const parser=new Parser(tokens);
    const ast=parser.parseProgram();
    const outputs=[];
    const env={ vars:Object.create(null), inputs:[...(opts.inputs||[])], output: (line)=>{
      if(opts.onOutput) opts.onOutput(String(line));
      outputs.push(String(line));
    }};
    for(const stmt of ast.body){ execStmt(stmt, env); }
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
