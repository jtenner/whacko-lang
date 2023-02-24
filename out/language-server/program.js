"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhackoProgram = void 0;
const module_1 = require("./module");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const parser_1 = require("./parser");
const ModuleCollectionPass_1 = require("./passes/ModuleCollectionPass");
class WhackoProgram {
    modules = new Map();
    addModule(modPath, from) {
        const absoluteModPath = node_path_1.default.join(from, modPath);
        if (this.modules.has(absoluteModPath)) {
            return this.modules.get(absoluteModPath);
        }
        try {
            const contents = node_fs_1.default.readFileSync(absoluteModPath, "utf-8");
            const parsedContents = (0, parser_1.parse)(contents);
            if (!parsedContents)
                return null;
            const mod = new module_1.WhackoModule(parsedContents.value);
            this.modules.set(absoluteModPath, mod);
            for (const lexerDiagnostic of parsedContents.lexerErrors) {
                mod.diagnostics.push({
                    level: 3 /* DiagnosticLevel.Error */,
                    message: lexerDiagnostic.message,
                    col: lexerDiagnostic.column,
                    line: lexerDiagnostic.line,
                });
            }
            for (const parserDiagnostic of parsedContents.parserErrors) {
                mod.diagnostics.push({
                    level: 3 /* DiagnosticLevel.Error */,
                    message: parserDiagnostic.message,
                    col: parserDiagnostic.token.startColumn,
                    line: parserDiagnostic.token.startLine,
                });
            }
            const collectModules = new ModuleCollectionPass_1.ModuleCollectionPass();
            mod.visit(collectModules);
            const dirname = node_path_1.default.dirname(absoluteModPath);
            for (const module of collectModules.modulesToAdd) {
                this.addModule(module, dirname);
            }
            return mod;
        }
        catch (ex) {
            return null;
        }
    }
}
exports.WhackoProgram = WhackoProgram;
//# sourceMappingURL=program.js.map