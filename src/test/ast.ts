// import { BaseWhackoVisitor } from "../ast/visitor";
// import { parser } from "../ast/parser.js";
import util from "node:util";
import { tokenize } from "../ast/tokenizer.js";
import glob from "glob";
import fs from "fs";
import path from "path";
import * as diff from "diff";
import color from "colors";
import { WhackoParser } from "../ast/parser.js";

const updateSnapshots = process.argv.includes("--update-snapshots") || process.argv.includes("-u");
const files = glob.sync("./test/ast/*.wo");

function testSnapshot(file: string, obj: any) {
  if (!fs.existsSync(file)) return writeSnapshot(file, obj);

  const expectedValue = fs.readFileSync(file, "utf-8");
  const actualValue = util.inspect(obj, {
    depth: Infinity,
    colors: false,
  });

  if (expectedValue === actualValue) {
    process.stdout.write(color.green(`[Ok]: `) + file + "\n");
  } else {
    process.stdout.write(color.red(`[Fail]: `) + file + "\n");
    const changes = diff.diffLines(expectedValue, actualValue);

    for (const change of changes) {
      if (change.added) {
        printDiffLines(change.value, "+ ", color.green);
      } else if (change.removed) {
        printDiffLines(change.value, "- ", color.red);
      } else {
        printDiffLines(change.value, "  ");
      }
    }
    process.stdout.write("\n");
    process.exitCode = 1;
  }
}

function writeSnapshot(file: string, obj: any) {
  fs.writeFileSync(file, util.inspect(obj,  {
    depth: Infinity,
    colors: false,
  }));
}

function printDiffLines(change: string, start: string, fmt?: color.Color) {
  const lines = change.split("\n");
  change = start + lines.join("\n" + start);
  process.stdout.write(fmt ? fmt(change) : change);
}

for (const file of files) {
  const dirname = path.dirname(file);
  const basename = path.basename(file, path.extname(file));
  const contents = fs.readFileSync(file, "utf-8");
  const tokens = tokenize(contents);
  console.log(tokens);
  const p = new WhackoParser();
  const snapshotLocation = path.join(dirname, basename + ".snap");
  const parseResult = p.parse(tokens);
  
  if(updateSnapshots) writeSnapshot(snapshotLocation, parseResult);
  testSnapshot(snapshotLocation, parseResult);
}
