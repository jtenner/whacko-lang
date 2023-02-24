import { IDiagnostic } from "../util";
import { WhackoVisitor } from "../WhackoVisitor";

export class WhackoPass extends WhackoVisitor {
  diagnostics: IDiagnostic[] = [];
}
