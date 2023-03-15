import { FunctionDeclaration } from "../generated/ast";
import { WhackoPass } from "./WhackoPass";

export class ReturnPass extends WhackoPass {
  override visitFunctionDeclaration(node: FunctionDeclaration): void {}
}
