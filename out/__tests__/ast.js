"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("langium/node");
const whacko_module_1 = require("../language-server/whacko-module");
const node_fs_1 = require("node:fs");
const glob_1 = require("glob");
const node_process_1 = require("node:process");
const diff_1 = __importDefault(require("diff"));
const node_util_1 = __importDefault(require("node:util"));
const node_path_1 = __importDefault(require("node:path"));
const colors_1 = __importDefault(require("colors"));
const parser = (0, whacko_module_1.createWhackoServices)(node_1.NodeFileSystem).Whacko.parser.LangiumParser;
const update = node_process_1.argv.includes("--update");
async function main() {
    const files = (0, glob_1.sync)("./src/__tests__/ast-snapshots/*.wo");
    for (const file of files) {
        const contents = await node_fs_1.promises.readFile(file, "utf8");
        const dirname = node_path_1.default.dirname(file);
        const basename = node_path_1.default.basename(file, node_path_1.default.extname(file));
        let actual;
        try {
            const ast = parser.parse(contents).value;
            actual = node_util_1.default.inspect(ast, false, Infinity, false);
        }
        catch (ex) {
            actual = ex.message;
        }
        const jsonFile = node_path_1.default.join(dirname, basename + ".json");
        try {
            await node_fs_1.promises.access(jsonFile);
            if (update) {
                await node_fs_1.promises.writeFile(jsonFile, actual);
            }
            else {
                // perform diff
                const expected = await node_fs_1.promises.readFile(jsonFile, "utf8");
                const diffs = diff_1.default.diffLines(expected, actual);
                node_process_1.stdout.write(`${colors_1.default.green("[File]")}: ${file}\n\n`);
                // for each diff..
                for (const diff of diffs) {
                    const lines = diff.value.split("\n");
                    if (diff.added) {
                        for (const line of lines) {
                            node_process_1.stdout.write(colors_1.default.green("+ " + line) + "\n");
                        }
                        process.exitCode = 1;
                    }
                    else if (diff.removed) {
                        for (const line of lines) {
                            node_process_1.stdout.write(colors_1.default.red("- " + line) + "\n");
                        }
                        process.exitCode = 1;
                    }
                    else {
                        for (const line of lines) {
                            node_process_1.stdout.write("  " + line + "\n");
                        }
                    }
                }
                node_process_1.stdout.write("\n");
            }
        }
        catch (ex) {
            await node_fs_1.promises.writeFile(jsonFile, contents);
        }
    }
}
main();
//# sourceMappingURL=ast.js.map