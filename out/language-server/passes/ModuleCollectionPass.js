"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModuleCollectionPass = void 0;
const WhackoPass_1 = require("./WhackoPass");
class ModuleCollectionPass extends WhackoPass_1.WhackoPass {
    modulesToAdd = [];
    constructor() {
        super();
    }
    visitImportDeclaration(node) {
        this.modulesToAdd.push(node.path);
    }
}
exports.ModuleCollectionPass = ModuleCollectionPass;
//# sourceMappingURL=ModuleCollectionPass.js.map