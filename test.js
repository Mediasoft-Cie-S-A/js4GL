const { interpret4GL } = typeof Mini4GL !== 'undefined' ? Mini4GL : require('./mini4GL.js');

const program = `
  ASSIGN n = 3.
  DO WHILE n > 0:
    DISPLAY "tick", n.
    n = n - 1.
  END.
  DISPLAY "done".
`;

async function run() {
  const { output } = await interpret4GL(program, { inputs: [], onOutput: console.log });
  if (require.main === module) {
    console.log(`\n${output.length} ligne(s) affichée(s).`);
  }
  return output;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

module.exports = { run };
