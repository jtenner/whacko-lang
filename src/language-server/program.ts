import { WhackoModule } from "./module";
import path from "node:path";
import fs from "node:fs";
import { parse } from "./parser";
import { DiagnosticLevel } from "./util";
import { ModuleCollectionPass } from "./passes/ModuleCollectionPass";

export class WhackoProgram {
  modules = new Map<string, WhackoModule>();

  addModule(modPath: string, from: string): WhackoModule | null {
    const absoluteModPath = path.join(from, modPath);
    if (this.modules.has(absoluteModPath)) {
      return this.modules.get(absoluteModPath)!;
    }

    try {
      const contents = fs.readFileSync(absoluteModPath, "utf-8");
      const parsedContents = parse(contents);
      if (!parsedContents) return null;
      const mod = new WhackoModule(parsedContents.value);
      this.modules.set(absoluteModPath, mod);
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
      const collectModules = new ModuleCollectionPass();
      mod.visit(collectModules);
      const dirname = path.dirname(absoluteModPath);
      for (const module of collectModules.modulesToAdd) {
        this.addModule(module, dirname);
      }
      return mod;
    } catch (ex) {
      return null;
    }
  }
}