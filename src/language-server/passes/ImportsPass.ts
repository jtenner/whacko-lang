import { ImportDeclaration } from "../generated/ast";
import { WhackoPass } from "./WhackoPass";
import path from "node:path";

export class ImportsPass extends WhackoPass {
  override visitImportDeclaration(node: ImportDeclaration): void {
    const dirname = path.dirname(this.currentMod!.path);
    const importPath = path.join(dirname, node.path);
    const extension = path.extname(importPath);

    if (extension !== ".wo") {
      this.error(`Semantic`, node, `Invalid import path ${node.path}.`);
      return;
    }

    if (this.program.modules.has(importPath)) {
      const mod = this.program.modules.get(importPath)!;
      const scope = this.currentMod!.scope;
      const exports = mod.exports;

      for (const declarator of node.declarators) {
        const name = declarator.name.name;
        const alias = declarator.alias?.name ?? name;

        if (scope.has(alias)) {
          this.error(
            `Semantic`,
            declarator,
            `Cannot define ${alias}, alias already defined in scope.`
          );
        } else if (exports.has(name)) {
          // success! we can import the scopeelement into scope
          const scopeElement = exports.get(name)!;
          scope.add(alias, scopeElement);
        } else {
          this.error(
            `Semantic`,
            declarator,
            `Cannot define ${alias}, ${name} is not an export of ${node.path}.`
          );
        }
      }
    } else {
      this.error(`File`, node, `Module ${node.path} does not exist.`);
    }
  }
}
