(function(global){
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
    'LOCK',
    'FIND',
    'FIRST',
    'LAST',
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
    'FRAME',
    'CENTERED',
    'PROCEDURE',
    'RUN',
    'PARAMETER',
    'OUTPUT',
    'DESCENDING',
    'BREAK',
    'PRIVATE',
    'EXTERNAL',
    'IN',
    'SUPER',
    'ORDINAL',
    'PERSISTENT',
    'THREAD',
    'SAFE',
    'CDECL',
    'PASCAL',
    'STDCALL',
    'FROM',
    'STREAM',
    'HANDLE',
    'TERMINAL',
    'VALUE',
    'OS',
    'DIR',
    'LOB',
    'ATTR',
    'LIST',
    'BINARY',
    'ECHO',
    'MAP',
    'UNBUFFERED',
    'CONVERT',
    'TARGET',
    'SOURCE',
    'CREATE',
    'ENABLE',
    'VIEW',
    'APPLY',
    'ON',
    'WAIT',
    'TO'
  ]);

  function isAlpha(ch){ return /[A-Za-z_]/.test(ch); }
  function isAlnum(ch){ return /[A-Za-z0-9_]/.test(ch); }
  function isDigit(ch){ return /[0-9]/.test(ch); }

  function tokenize(src){
    const tokens=[]; let i=0; const n=src.length;
    const push=(type,value)=>tokens.push({type,value,pos:i});
    while(i<n){
      let ch=src[i];
      if(/\s/.test(ch)){ i++; continue; }
      if(ch==='/' && src[i+1]==='*'){
        i+=2;
        while(i<n && !(src[i]==='*' && src[i+1]==='/')) i++;
        i+=2;
        continue;
      }
      if(ch==='/' && src[i+1]==='/'){
        i+=2;
        while(i<n && src[i]!=="\n") i++;
        continue;
      }
      if(ch==='?'){ push('UNKNOWN', null); i++; continue; }
      if(ch==='"'){
        i++; let s=""; let esc=false;
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
      if(isDigit(ch) || (ch==='.' && isDigit(src[i+1]))){
        let start=i; i++;
        while(i<n && (isDigit(src[i]) || src[i]==='.')) i++;
        push('NUMBER', parseFloat(src.slice(start,i)));
        continue;
      }
      if(isAlpha(ch)){
        let start=i; i++;
        while(i<n && isAlnum(src[i])) i++;
        const raw=src.slice(start,i);
        const upper=raw.toUpperCase();
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
      const two=src.slice(i,i+2);
      if(['<=','>=','<>','=='].includes(two)){ push('OP', two); i+=2; continue; }
      const singleMap={
        '+':'OP','-':'OP','*':'OP','/':'OP','=':'OP','<':'OP','>':'OP','(':'LPAREN',')':'RPAREN',',':'COMMA',':':'COLON','.' :'DOT'
      };
      if(singleMap[ch]){ push(singleMap[ch], ch); i++; continue; }
      throw new SyntaxError(`Unexpected character '${ch}' at ${i}`);
    }
    tokens.push({type:'EOF', value:null, pos:i});
    return tokens;
  }

  function Parser(tokens, registry){
    this.toks=tokens;
    this.i=0;
    attachRegistry(this, registry);
  }
  Parser.prototype.peek=function(){ return this.toks[this.i]; };
  Parser.prototype.eat=function(type){
    const t=this.peek();
    if(type && t.type!==type) throw new SyntaxError(`Expected ${type} but got ${t.type}`);
    this.i++; return t;
  };
  Parser.prototype.match=function(...types){
    const t=this.peek();
    if(types.includes(t.type)){ this.i++; return t; }
    return null;
  };

  Parser.prototype.parseProgram=function(){
    const body=[];
    while(this.peek().type!=='EOF'){
      if(this.match('DOT')) continue;
      body.push(this.parseStatement());
    }
    return { type:'Program', body };
  };

  Parser.prototype.parseStatement=function(){
    const t=this.peek();
    if(t.type==='END'){
      this.eat('END');
      this.optionalDot();
      return {type:'Empty'};
    }

    if(t.type==='IDENT'){
      for(const handler of this.identifierParsers || []){
        if(handler && typeof handler.parse==='function'){
          return handler.parse(this, t);
        }
      }
    }

    const handler=(this.keywordMap || Object.create(null))[t.type];
    if(handler && typeof handler.parse==='function'){
      return handler.parse(this, t);
    }

    throw new SyntaxError(`Unexpected token ${t.type}`);
  };

  Parser.prototype.optionalDot=function(){ if(this.match('DOT')) return; };

  Parser.prototype.parsePossiblyBlock=function(){
    if(this.match('COLON')){
      const body=this.parseBlockStatements();
      this.eat('END'); this.optionalDot();
      return { type:'Block', body };
    }
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
      if(t.type==='OP' && (t.value==='+'||t.value==='-')){
        this.eat('OP');
        node={type:'Binary', op:t.value, left:node, right:this.parseMul()};
      } else break;
    }
    return node;
  };
  Parser.prototype.parseMul=function(){
    let node=this.parseUnary();
    while(true){
      const t=this.peek();
      if(t.type==='OP' && (t.value==='*'||t.value==='/')){
        this.eat('OP');
        node={type:'Binary', op:t.value, left:node, right:this.parseUnary()};
      } else break;
    }
    return node;
  };
  Parser.prototype.parseUnary=function(){
    const t=this.peek();
    if(t.type==='OP' && (t.value==='+'||t.value==='-')){
      this.eat('OP');
      return {type:'Unary', op:t.value, arg:this.parseUnary()};
    }
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
        const args=[];
        if(this.peek().type!=='RPAREN'){
          args.push(this.parseExpr());
          while(this.match('COMMA')) args.push(this.parseExpr());
        }
        this.eat('RPAREN');
        return { type:'Call', name:segments[0].toUpperCase(), args };
      }
      if(segments.length>1){
        return { type:'Field', path: segments };
      }
      return { type:'Var', name:segments[0].toLowerCase() };
    }
    if(this.match('UNKNOWN')){ return { type:'Unknown' }; }
    if(this.match('LPAREN')){
      const e=this.parseExpr();
      this.eat('RPAREN');
      return e;
    }
    throw new SyntaxError(`Unexpected token in expression: ${t.type}`);
  };

  function attachRegistry(parser, registry){
    if(!registry) return parser;
    parser.keywordMap = registry.keywordMap || Object.create(null);
    parser.identifierParsers = registry.identifierParsers || [];
    return parser;
  }

  function createParser(tokens, registry){
    return new Parser(tokens, registry);
  }

  const api={ tokenize, Parser, createParser };
  if(typeof module!=='undefined' && module.exports){ module.exports=api; }
  else { global.Mini4GLParser=api; }
})(typeof window!=='undefined' ? window : globalThis);
