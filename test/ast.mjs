const { default: glob } = await import("glob");
const files = glob.sync("test/ast/*.wo");
const path = await import("node:path");
const fs = await import("node:fs/promises");
const { parse } = await import("../out/language-server/parser.js");
const { inspect } = await import("node:util");
const { diffLines } = await import("diff");
const { default: colors } = await import("colors");
const update = process.argv.includes("--update");

async function exists(loc) {
  try {
    await fs.access(loc);
  } catch(ex) {
    return false;
  }
  return true;
}

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
  const outfile = path.join(dirname, basename + ".snap");

  if (await exists(outfile) && !update) {
    
    const expected = await fs.readFile(outfile, "utf-8");
    const changes = diffLines(expected, actual);
    
    process.stdout.write(colors.yellow(`[${basename}] ->\n`));
    
    for (const change of changes) {
      const value = change.value.slice(0, -1);
      const last = change.value.slice(-1);
      if (change.added) {
        const lines = "+ " + value.split("\n").join("\n+ ");
        process.stdout.write(colors.green(lines + last));
      } else if (change.removed) {
        const lines = "- " + value.split("\n").join("\n- ");
        process.stdout.write(colors.red(lines + last));
      } else {
        const lines = "  " + value.split("\n").join("\n  ");
        process.stdout.write(lines + last);
      }
    }

    process.stdout.write("\n");

    // we will compare the values
  } else {
    await fs.writeFile(outfile, actual, "utf-8");
  }

}
