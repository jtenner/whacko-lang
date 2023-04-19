import {
  StringLiteral,
  ExportStarDeclaration,
  ImportDeclaration,
} from "../generated/ast";
import { WhackoModule, WhackoProgram } from "../program";
import { WhackoVisitor } from "../WhackoVisitor";
import { dirname, join } from "node:path";
import { putElementInScope, ScopeElementType } from "../scope";
import { reportErrorDiagnostic } from "../diagnostic";
import { AstNode } from "langium";
import { assert } from "../util";

interface Pathable extends AstNode {
  path: StringLiteral;
}

function findImportedModule(
  program: WhackoProgram,
  module: WhackoModule,
  declaration: Pathable,
): WhackoModule | null {
  const modulePath = module.absolutePath;
  const absolutePath = join(dirname(modulePath), declaration.path.value);
  const importedModule = program.modules.get(absolutePath);

  if (!importedModule) {
    reportErrorDiagnostic(
      program,
      module,
      "import",
      declaration.path,
      `Could not find imported module "${declaration.path}"`,
    );
    return null;
  }

  return importedModule;
}

export class ImportCollectionPass extends WhackoVisitor {
  constructor(public program: WhackoProgram) {
    super();
  }

  currentModule!: WhackoModule;

  visitModule(module: WhackoModule) {
    this.currentModule = module;
    this.visit(module.ast);
  }

  override visitImportDeclaration(node: ImportDeclaration): void {
    const importedModule = findImportedModule(
      this.program,
      this.currentModule,
      node,
    );
    const currentModuleScope = this.currentModule.scope;

    if (!importedModule) return;

    for (const declarator of node.declarators) {
      const importName = declarator.name;
      const aliasName = declarator.alias ?? importName;
      const importedElement = importedModule!.exports.get(importName.name);

      if (!importedElement) {
        reportErrorDiagnostic(
          this.program,
          this.currentModule,
          "import",
          node,
          `Could not find export from module "${node.path}"`,
        );
        continue;
      }

      putElementInScope(
        this.program,
        this.currentModule,
        aliasName,
        importedElement,
        currentModuleScope,
      );
    }
  }

  override visitExportStarDeclaration(node: ExportStarDeclaration): void {
    const program = this.program;
    const currentModule = this.currentModule;
    const importedModule = findImportedModule(program, currentModule, node);

    if (!importedModule) return;

    const stub = assert(
      currentModule.exports.get(node.name.name),
      "The namespace stub should exist at this point.",
    );

    stub.type = ScopeElementType.Namespace;
    stub.exports = importedModule.exports;
  }
}
