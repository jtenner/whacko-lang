"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhackoModule = void 0;
class WhackoModule {
    ast;
    constructor(ast) {
        this.ast = ast;
    }
    diagnostics = [];
    visit(pass) {
        pass.visit(this.ast);
        this.diagnostics = this.diagnostics.concat(pass.diagnostics);
    }
}
exports.WhackoModule = WhackoModule;
//# sourceMappingURL=module.js.map