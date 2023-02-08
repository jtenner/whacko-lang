import glob from "glob";
import fs from "node:fs";
import * as diff from "diff";
import util from "node:util";
import path from "node:path";
import { Parser } from "../lib/parser.js";
import chalk from "chalk";

const files = glob.sync("./test/ast/*.wo");
const updateSnapshots = process.argv.includes("--update-snapshots");
let failed = false;

for (const file of files) {
  const contents = fs.readFileSync(file, "utf-8");
  const dir = path.dirname(file);
  const basename = path.basename(file, path.extname(file));
  const snapfile = `${dir}/${basename}.snap`;
  const p = new Parser();
  const ast = p.parse(contents);
  const actualValue = util.inspect(ast, true, Infinity, false);

  if (updateSnapshots) {
    fs.writeFileSync(snapfile, actualValue, "utf-8");
  } else {
    // we are testing
    if (fs.existsSync(snapfile)) {
      process.stdout.write(`${chalk.greenBright("Testing: ")}: ${basename} -> \n`);
      const expectedValue = fs.readFileSync(snapfile, "utf-8");
      const changes = diff.diffLines(expectedValue, actualValue);
      
      for (const change of changes) {
        if (change.added) {
          process.stdout.write(chalk.greenBright("+ " + change.value));
          failed = true;
        } else if (change.removed) {
          process.stdout.write(chalk.redBright("+ " + change.value));
          failed = true;
        } else {
          process.stdout.write("  " + change.value);
        }
      }
    } else {
      fs.writeFileSync(snapfile, actualValue, "utf-8");
    }
  }
}

if (failed) {
  process.stderr.write("\n\n" + chalk.redBright("[Snapshots failed]"));
  process.exit(1);
}
