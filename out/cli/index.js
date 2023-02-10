"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAction = void 0;
const chalk_1 = __importDefault(require("chalk"));
const commander_1 = require("commander");
const module_1 = require("../language-server/generated/module");
const whacko_module_1 = require("../language-server/whacko-module");
const cli_util_1 = require("./cli-util");
const generator_1 = require("./generator");
const node_1 = require("langium/node");
const generateAction = async (fileName, opts) => {
    const services = (0, whacko_module_1.createWhackoServices)(node_1.NodeFileSystem).Whacko;
    const model = await (0, cli_util_1.extractAstNode)(fileName, services);
    const generatedFilePath = (0, generator_1.generateJavaScript)(model, fileName, opts.destination);
    console.log(chalk_1.default.green(`JavaScript code generated successfully: ${generatedFilePath}`));
};
exports.generateAction = generateAction;
function default_1() {
    const program = new commander_1.Command();
    program
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        .version(require('../../package.json').version);
    const fileExtensions = module_1.WhackoLanguageMetaData.fileExtensions.join(', ');
    program
        .command('generate')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('generates JavaScript code that prints "Hello, {name}!" for each greeting in a source file')
        .action(exports.generateAction);
    program.parse(process.argv);
}
exports.default = default_1;
//# sourceMappingURL=index.js.map