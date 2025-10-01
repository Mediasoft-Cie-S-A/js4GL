const { interpret4GL } = Mini4GL; // ou require('./mini4gl.js') en Node
const program = `
  ASSIGN n = 3.
  DO WHILE n > 0:
    DISPLAY "tick", n.
    n = n - 1.
  END.
  DISPLAY "done".
`;
const { output, env } = interpret4GL(program, { inputs: [], onOutput: console.log });
