"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse = void 0;
const node_1 = require("langium/node");
const whacko_module_1 = require("./whacko-module");
const Whacko = (0, whacko_module_1.createWhackoServices)(node_1.NodeFileSystem).Whacko;
function parse(contents) {
    const ast = Whacko.parser.LangiumParser.parse(contents);
    return ast;
    // visitor.visit(ast);
}
exports.parse = parse;
//# sourceMappingURL=parser.js.map