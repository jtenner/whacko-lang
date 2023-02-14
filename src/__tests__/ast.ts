import { NodeFileSystem } from "langium/node";
import { createWhackoServices } from "../language-server/whacko-module";
import { promises as fs } from "node:fs";
import { sync as glob } from "glob";
import { argv, stdout } from "node:process";
import diff from "diff";
import util from "node:util";
import path from "node:path";
import colors from "colors";

const parser = createWhackoServices(NodeFileSystem).Whacko.parser.LangiumParser;
const update = argv.includes("--update");

async function main() {
  const files = glob("./src/__tests__/ast-snapshots/*.wo");

  for (const file of files) {
    const contents = await fs.readFile(file, "utf8");
    const dirname = path.dirname(file);
    const basename = path.basename(file, path.extname(file));

    let actual: string;
    try {
      const ast = parser.parse(contents).value;
      actual = util.inspect(ast, false, Infinity, false);
    } catch (ex) {
      actual = (ex as Error).message;
    }

    const jsonFile = path.join(dirname, basename + ".json");

    try {
      await fs.access(jsonFile)
      if (update) {
        await fs.writeFile(jsonFile, actual);

      } else {
        // perform diff
        const expected = await fs.readFile(jsonFile, "utf8");
        const diffs = diff.diffLines(expected, actual);
        stdout.write(`${colors.green("[File]")}: ${file}\n\n`);
        
        // for each diff..
        for (const diff of diffs) {
          const lines = diff.value.split("\n");

          if (diff.added) {
            for (const line of lines) {
              stdout.write(colors.green("+ " + line) + "\n");
            }
            process.exitCode = 1;
          } else if (diff.removed) {
            for (const line of lines) {
              stdout.write(colors.red("- " + line) + "\n");
            }
            process.exitCode = 1;
          } else {
            for (const line of lines) {
              stdout.write("  " + line + "\n");
            }
            
          }
        }
        stdout.write("\n");
      }
    } catch (ex) {
      await fs.writeFile(jsonFile, contents);
    }
  }
}

main();