"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("langium/node");
const whacko_module_1 = require("../language-server/whacko-module");
const cli_util_1 = require("./cli-util");
async function getAST(file, services) {
    return (0, cli_util_1.extractAstNode)(file, services);
}
async function default_1() {
    const services = (0, whacko_module_1.createWhackoServices)(node_1.NodeFileSystem).Whacko;
    const ast = await getAST("./myFile.wo", services);
    console.log(ast);
}
exports.default = default_1;
//# sourceMappingURL=index.js.map