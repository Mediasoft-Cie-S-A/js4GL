(function(global){
  function createBuiltinEvaluator(helpers){
    const {
      formatDisplayValue,
      formatTimeFromSeconds,
      parse4GLDate,
      toIntegerValue
    } = helpers;

    return function evaluateBuiltin(name, args, env){
      switch(name){
        case 'UPPER':
          return String(args[0] ?? '').toUpperCase();
        case 'LOWER':
          return String(args[0] ?? '').toLowerCase();
        case 'LENGTH':
          return String(args[0] ?? '').length;
        case 'INT':
          return parseInt(args[0] ?? 0, 10);
        case 'INTEGER':
          return toIntegerValue(args[0]);
        case 'FLOAT':
          return parseFloat(args[0] ?? 0);
        case 'STRING':{
          const source=args[0];
          const formatArg=args.length>=2 ? args[1] : null;
          if(formatArg==null){
            if(source==null) return '';
            if(source instanceof Date){
              return isNaN(source.getTime()) ? '' : source.toISOString();
            }
            if(typeof source==='object' && source!==null){
              try {
                const str=source.toString();
                return typeof str==='string' ? str : String(str);
              } catch(err){
                return '';
              }
            }
            return String(source);
          }
          const timeFormatted=formatTimeFromSeconds(source, formatArg);
          if(typeof timeFormatted!=='undefined') return timeFormatted;
          return formatDisplayValue(source, formatArg);
        }
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
          const delimiter=delimiterArg==null || delimiterArg==='' ? ',' : String(delimiterArg);
          const listString=String(listValue ?? '');
          const entries=listString.length ? listString.split(delimiter) : [''];
          const entry=entries[idx-1];
          return typeof entry==='undefined' ? '' : String(entry).trim();
        }
        case 'PRINT':
          if(env && typeof env.output==='function'){
            env.output(String(args.map(String).join(' ')));
          }
          return null;
        default:
          throw new Error(`Unknown function ${name}`);
      }
    };
  }

  const api={ createBuiltinEvaluator };
  if(typeof module!=='undefined' && module.exports){ module.exports=api; }
  else { global.Mini4GLBuiltins=api; }
})(typeof window!=='undefined' ? window : globalThis);
