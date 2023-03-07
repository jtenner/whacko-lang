import { WhackoModule } from "./module";
import path from "node:path";
import fs from "node:fs";
import { parse } from "./parser";
import { DiagnosticLevel } from "./util";
import { ModuleCollectionPass } from "./passes/ModuleCollectionPass";
import { ExportsPass } from "./passes/ExportsPass";
import { ImportsPass } from "./passes/ImportsPass";
import { ScopeCreationPass } from "./passes/ScopeCreationPass";
import { BuiltinFunction, Scope } from "./types";
import { AstNode } from "langium";
const stdlibFolder = path.join(__dirname, "../std");

export class WhackoProgram {
  modules = new Map<string, WhackoModule>();
  globalScope = new Scope();
  builtins = new Map<string, BuiltinFunction>();
  names = new Map<AstNode, string>();

  addBuiltin(name: string, func: BuiltinFunction) {
    if (this.builtins.has(name)) {
      throw new Error("Builtin already defined.");
    }
    this.builtins.set(name, func);
  }

  addModule(
    modPath: string,
    from: string,
    entry: boolean,
    scope: Scope
  ): WhackoModule | null {
    const absoluteModPath = path.join(from, modPath);
    if (this.modules.has(absoluteModPath)) {
      return this.modules.get(absoluteModPath)!;
    }

    try {
      const contents = fs.readFileSync(absoluteModPath, "utf-8");
      const parsedContents = parse(contents, absoluteModPath);
      if (!parsedContents) return null;

      const mod = new WhackoModule(
        parsedContents.value,
        absoluteModPath,
        entry,
        scope
      );

      if (absoluteModPath.startsWith(stdlibFolder)) {
        const modName = path.basename(absoluteModPath, ".wo");
        this.modules.set("whacko:" + modName, mod);
      } else {
        this.modules.set(absoluteModPath, mod);
      }

      // Diagnostics from the parser get added at the module level
      for (const lexerDiagnostic of parsedContents.lexerErrors) {
        mod.diagnostics.push({
          level: DiagnosticLevel.Error,
          message: lexerDiagnostic.message,
          col: lexerDiagnostic.column!,
          line: lexerDiagnostic.line!,
        });
      }
      for (const parserDiagnostic of parsedContents.parserErrors) {
        mod.diagnostics.push({
          level: DiagnosticLevel.Error,
          message: parserDiagnostic.message,
          col: parserDiagnostic.token.startColumn!,
          line: parserDiagnostic.token.startLine!,
        });
      }

      // Module collection pass allows us to traverse imports as a first step
      const collectModules = new ModuleCollectionPass(this);
      collectModules.visitModule(mod);
      const dirname = path.dirname(absoluteModPath);
      for (const module of collectModules.modulesToAdd) {
        // this is where the child modules are added
        this.addModule(module, dirname, false, this.globalScope.fork());
      }
      return mod;
    } catch (ex) {
      return null;
    }
  }

  compile(): Map<string, Buffer> {
    const exportsPass = new ExportsPass(this);
    for (const [, module] of this.modules) {
      exportsPass.visitModule(module);
    }

    const importsPass = new ImportsPass(this);
    for (const [, module] of this.modules) {
      importsPass.visitModule(module);
    }

    const scopeCreationPass = new ScopeCreationPass(this);
    for (const [, module] of this.modules) {
      scopeCreationPass.visitModule(module);
    }

    return new Map();
  }
}
