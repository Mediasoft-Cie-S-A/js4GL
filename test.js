const assert = require('assert');
const { interpret4GL } = typeof Mini4GL !== 'undefined' ? Mini4GL : require('./mini4GL.js');

const tests = [
  {
    name: 'MONTH converts ISO and slash-separated dates to month numbers',
    program: `
      DISPLAY MONTH("2024-03-15").
      DISPLAY MONTH("2024/11/05").
    `,
    verify: ({ output }) => {
      assert.deepStrictEqual(output, ['3', '11']);
    }
  },
  {
    name: 'ENTRY splits lists with default and custom delimiters',
    program: `
      DISPLAY ENTRY(2, "alpha,beta,gamma").
      DISPLAY ENTRY(3, "a|b|c", "|").
      DISPLAY ENTRY(5, "x,y,z").
    `,
    verify: ({ output }) => {
      assert.deepStrictEqual(output, ['beta', 'c', '']);
    }
  },
  {
    name: 'FORMAT "99/99/99" reformats date strings before output',
    program: `
      DEFINE VARIABLE orderDate AS CHARACTER INIT "2024-05-17".
      DISPLAY orderDate FORMAT "99/99/99".
      DISPLAY orderDate FORMAT "99-99-9999".
      DISPLAY orderDate.
    `,
    verify: ({ output }) => {
      assert.deepStrictEqual(output, ['17/05/24', '17-05-2024', '2024-05-17']);
    }
  }
];

async function runSingleTest(test){
  const result = await interpret4GL(test.program, { inputs: [], onOutput: () => {} });
  test.verify(result);
  return result;
}

async function run(){
  const outcomes=[];
  for(const test of tests){
    const result=await runSingleTest(test);
    outcomes.push({ name: test.name, output: result.output });
    console.log(`✓ ${test.name}`);
  }
  return outcomes;
}

if(require.main === module){
  run()
    .then(() => {
      console.log(`\n${tests.length} test(s) réussi(s).`);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { run };
