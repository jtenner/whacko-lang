"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const node_util_1 = require("node:util");
const program_1 = require("../language-server/program");
// import { WhackoProgram } from "../compiler";
const options = {};
async function main(args) {
    const { values, positionals, } = (0, node_util_1.parseArgs)({ args, options, allowPositionals: true });
    const program = new program_1.WhackoProgram();
    for (const positional of positionals)
        program.addModule(positional, process.cwd());
}
exports.default = main;
//# sourceMappingURL=index.js.map