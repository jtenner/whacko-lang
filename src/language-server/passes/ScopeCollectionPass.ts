import { AstNode } from "langium";
import { LLVMBuilderRef } from "llvm-js";
import { ExecutionContext, ExecutionVariable } from "../execution-context";
import { FunctionLiteral, Parameter, VariableDeclarator } from "../generated/ast";
import { WhackoProgram } from "../program";
import { ConcreteType, getScope, VariableScopeElement } from "../types";
import { assert, logNode } from "../util";
import { CompilationPass } from "./CompilationPass";
import { WhackoPass } from "./WhackoPass";

const visited = new WeakSet<AstNode>;
export class ScopeCollectionPass extends WhackoPass {
  constructor(
    program: WhackoProgram,
    public ctx: ExecutionContext,
    public pass: CompilationPass
  ) {
    super(program);
  }

  override visitParameter(node: Parameter): void {
    const { LLVM, LLVMUtil } = this.program;
    const parent = node.$container;
    const scope = assert(getScope(node), "The scope must be created for this node at this point.");
    
    if (!visited.has(node)) {  
      scope.add(node.name.name, new VariableScopeElement(node));
      visited.add(node);
    }

    let ty = this.ctx.resolve(node.type);
    if (!ty) this.pass.error("Type", node.type, "Unable to resolve variable type.");
    
    const variable = new ExecutionVariable(false, node.name.name, null, ty);

    const name = this.pass.getTempNameRef();
    variable.ptr = LLVM._LLVMBuildAlloca(
      this.pass.builder,
      ty?.llvmType(LLVM, LLVMUtil) ?? LLVM._LLVMInt128Type(),
      name
    );

    const getParam = LLVM._LLVMGetParam(this.pass.func.funcRef, node.$containerIndex!);
    LLVM._LLVMBuildStore(
      this.pass.builder,
      getParam,
      variable.ptr
    );

    LLVM._free(name);

    this.ctx.vars.set(node, variable);
  }

  override visitVariableDeclarator(node: VariableDeclarator): void {
    const { LLVM, LLVMUtil } = this.program;
    const parent = node.$container;
    const scope = assert(getScope(node), "The scope must be created for this node at this point.");

    if (!visited.has(node)) { 
      scope.add(node.name.name, new VariableScopeElement(node));
      visited.add(node);
    }

    let ty: ConcreteType | null = null;
    if (node.type) {
      ty = this.ctx.resolve(node.type);
      if (!ty) this.pass.error("Type", node.type, "Unable to resolve variable type.");
    }
    const variable = new ExecutionVariable(parent.immutable, node.name.name, null, ty);

    if (!parent.immutable) {
      const name = this.pass.getTempNameRef();
      variable.ptr = LLVM._LLVMBuildAlloca(
        this.pass.builder,
        ty?.llvmType(LLVM, LLVMUtil) ?? LLVM._LLVMInt128Type(),
        name
      );
      LLVM._free(name);
    }

    this.ctx.vars.set(node, variable);
  }

  override visitFunctionLiteral(node: FunctionLiteral): void {

  }
}
