const { default: glob } = await import("glob");
const files = glob.sync("test/programs/*.wo");
const path = await import("node:path");
const fs = await import("node:fs/promises");
const { parse } = await import("../out/language-server/parser.js");
const { inspect } = await import("node:util");
const update = process.argv.includes("--update");


function visit(obj) {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      visit(obj[i]);
    }
    return;
  }

  if (obj.constructor === String) return;
  if (obj.constructor === Boolean) return;
  if (obj.constructor === Number) return;
  if (obj.constructor === BigInt) return;
  if (obj.constructor === Map) {
    for (const [key, value] of obj) {
      visit(value);
    }
    return;
  }
  if (obj.constructor === Set) {
    for (const value of obj) {
      visit(value);
    }
  }
  
  delete obj.$cstNode;
  delete obj.$container;
  delete obj.$containerProperty;
  delete obj.$containerIndex;

  for (const key of Object.keys(obj)) {
    visit(obj[key]);
  }
}

for (const file of files) {
  const dirname = path.dirname(file);
  const basename = path.basename(file, path.extname(file));
  const contents = await fs.readFile(file, "utf-8");
  const parseResult = parse(contents, file).value;
  visit(parseResult);
  
  const actual = inspect(parseResult, true, Infinity, false);
  const outfile = path.join(dirname, basename + ".ast.snap");

  if (await exists(outfile) && !update) {
    
    const expected = await fs.readFile(outfile, "utf-8");
    compareStringsToStdOut(expected, actual, basename);

    // we will compare the values
  } else {
    await fs.writeFile(outfile, actual, "utf-8");
  }
}

