"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("langium/node");
const whacko_module_1 = require("../language-server/whacko-module");
const node_fs_1 = require("node:fs");
const Whacko = (0, whacko_module_1.createWhackoServices)(node_1.NodeFileSystem).Whacko;
async function default_1() {
    const program = await node_fs_1.promises.readFile("./myFile.wo", "utf-8");
    const ast = Whacko.parser.LangiumParser.parse(program).value;
    // visitor.visit(ast);
}
exports.default = default_1;
//# sourceMappingURL=index.js.map