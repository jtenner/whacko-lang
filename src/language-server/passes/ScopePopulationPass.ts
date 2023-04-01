import { AstNode } from "langium";
import { reportErrorDiagnostic } from "../diagnostic";
import {
  AsyncBlockLiteral,
  BlockStatement,
  BuiltinDeclaration,
  BuiltinTypeDeclaration,
  ClassDeclaration,
  ConstructorClassMember,
  DeclareDeclaration,
  DeclareFunction,
  EnumDeclaration,
  ExportStarDeclaration,
  ExternDeclaration,
  FunctionDeclaration,
  FunctionLiteral,
  FunctionTypeExpression,
  GetterClassMember,
  GrabStatement,
  ID,
  MethodClassMember,
  NamespaceDeclaration,
  Parameter,
  SetterClassMember,
  TypeDeclaration,
  TypeDeclarationStatement,
  VariableDeclarator,
} from "../generated/ast";
import { WhackoModule, WhackoProgram } from "../program";
import {
  createNewScope,
  createNewScopeElement,
  defineElementInScope,
  defineExportInParent,
  Exportable,
  isInLocalScope,
  putElementInExports,
  putElementInScope,
  putTypeParametersInScope,
  Scope,
  ScopeElement,
  ScopeElementType,
} from "../scope";
import { assert } from "../util";
import { WhackoVisitor } from "../WhackoVisitor";

export interface Declaration extends AstNode {
  name: ID;
  typeParameters?: ID[];
}

const scopes = new WeakMap<AstNode, Scope>();

export function attachScopeToNode(node: AstNode, scope: Scope) {
  scopes.set(node, scope);
}

export function getScope(node: AstNode): Scope | null {
  let accumulator: AstNode | undefined = node;

  while (accumulator) {
    if (scopes.has(accumulator)) return scopes.get(accumulator)!;
    accumulator = accumulator.$container;
  }
  return null;
}

export class ScopePopulationPass extends WhackoVisitor {
  stack: Exportable[] = [];

  constructor(public program: WhackoProgram) {
    super();
  }

  visitModule(mod: WhackoModule) {
    assert(
      this.stack.length === 0,
      "The exportable stack at this point should be empty."
    );
    this.stack.push(mod);
    this.visit(mod.ast);
    this.stack.pop();
    assert(
      this.stack.length === 0,
      "The exportable stack at this point should be empty."
    );
  }

  get currentModule(): WhackoModule {
    return assert(
      this.stack[0] as WhackoModule,
      "The module should be the top level stack item at this point."
    );
  }

  override visitNamespaceDeclaration(node: NamespaceDeclaration): void {
    // get the parent, and assert it exists with a scope
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(parent.scope);

    // create a new scope element with a new map for its exports
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);

    const scopeElement = createNewScopeElement(
      node,
      ScopeElementType.Namespace,
      innerScope
    );
    scopeElement.exports = new Map<string, ScopeElement>();

    // define the element in the parent scope, because it exists in the parent's scope
    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      scopeElement,
      parentScope
    );
    if (node.export)
      putElementInExports(
        this.program,
        this.currentModule,
        node.name,
        scopeElement,
        parent
      );

    this.stack.push(scopeElement);
    super.visitNamespaceDeclaration(node);
    this.stack.pop();
  }

  override visitFunctionDeclaration(node: FunctionDeclaration): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const element = createNewScopeElement(
      node,
      ScopeElementType.Function,
      innerScope
    );

    putTypeParametersInScope(
      this.program,
      this.currentModule,
      node.typeParameters,
      innerScope
    );
    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      element,
      parentScope
    );
    if (node.export)
      putElementInExports(
        this.program,
        this.currentModule,
        node.name,
        element,
        parent
      );

    this.stack.push(element);
    super.visitFunctionDeclaration(node);
    this.stack.pop();
  }

  override visitBuiltinDeclaration(node: BuiltinDeclaration): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const element = createNewScopeElement(
      node,
      ScopeElementType.Builtin,
      innerScope
    );

    putTypeParametersInScope(
      this.program,
      this.currentModule,
      node.typeParameters,
      innerScope
    );
    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      element,
      parentScope
    );

    if (node.export)
      putElementInExports(
        this.program,
        this.currentModule,
        node.name,
        element,
        parent
      );
    this.stack.push(element);
    super.visitBuiltinDeclaration(node);
    this.stack.pop();
  }

  override visitBuiltinTypeDeclaration(node: BuiltinTypeDeclaration): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const element = createNewScopeElement(
      node,
      ScopeElementType.BuiltinType,
      innerScope
    );

    putTypeParametersInScope(
      this.program,
      this.currentModule,
      node.typeParameters,
      innerScope
    );
    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      element,
      parentScope
    );
    if (node.export)
      putElementInExports(
        this.program,
        this.currentModule,
        node.name,
        element,
        parent
      );
  }

  override visitDeclareDeclaration(node: DeclareDeclaration): void {
    // get the parent, and assert it exists with a scope
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(parent.scope);

    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    // create a new scope element with a new map for it's exports
    const scopeElement = createNewScopeElement(
      node,
      ScopeElementType.Namespace,
      innerScope
    );
    scopeElement.exports = new Map<string, ScopeElement>();

    // define the element in the parent scope, because it exists in the parent's scope
    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      scopeElement,
      parentScope
    );
    if (node.export)
      putElementInExports(
        this.program,
        this.currentModule,
        node.name,
        scopeElement,
        parent
      );

    this.stack.push(scopeElement);
    super.visitDeclareDeclaration(node);
    this.stack.pop();
  }

  override visitDeclareFunction(node: DeclareFunction): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const scopeElement = createNewScopeElement(
      node,
      ScopeElementType.DeclareFunction,
      innerScope
    );

    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      scopeElement,
      parentScope
    );
    putElementInExports(
      this.program,
      this.currentModule,
      node.name,
      scopeElement,
      parent
    );

    this.stack.push(scopeElement);
    super.visitDeclareFunction(node);
    this.stack.pop();
  }

  override visitVariableDeclarator(node: VariableDeclarator): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const scopeElement = createNewScopeElement(
      node,
      ScopeElementType.VariableDeclarator,
      parentScope
    );
    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      scopeElement,
      parentScope
    );
    this.stack.push(scopeElement);
    super.visitVariableDeclarator(node);
    this.stack.pop();
  }

  override visitParameter(node: Parameter): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const scopeElement = createNewScopeElement(
      node,
      ScopeElementType.Parameter,
      parentScope
    );
    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      scopeElement,
      parentScope
    );
  }

  override visitClassDeclaration(node: ClassDeclaration): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const scopeElement = createNewScopeElement(
      node,
      ScopeElementType.Class,
      innerScope
    );

    putTypeParametersInScope(
      this.program,
      this.currentModule,
      node.typeParameters,
      innerScope
    );
    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      scopeElement,
      parentScope
    );
    if (node.export)
      putElementInExports(
        this.program,
        this.currentModule,
        node.name,
        scopeElement,
        parent
      );

    this.stack.push(scopeElement);
    super.visitClassDeclaration(node);
    this.stack.pop();
  }

  override visitEnumDeclaration(node: EnumDeclaration): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const scopeElement = createNewScopeElement(
      node,
      ScopeElementType.Enum,
      parentScope
    );
    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      scopeElement,
      parentScope
    );
    if (node.export)
      putElementInExports(
        this.program,
        this.currentModule,
        node.name,
        scopeElement,
        parent
      );
  }

  override visitExportStarDeclaration(node: ExportStarDeclaration): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const scopeElement = createNewScopeElement(
      node,
      ScopeElementType.NamespaceStub,
      parentScope
    );
    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      scopeElement,
      parentScope
    );
    putElementInExports(
      this.program,
      this.currentModule,
      node.name,
      scopeElement,
      parent
    );
  }

  override visitTypeDeclaration(node: TypeDeclaration): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const scopeElement = createNewScopeElement(
      node,
      ScopeElementType.TypeDeclaration,
      innerScope
    );

    putTypeParametersInScope(
      this.program,
      this.currentModule,
      node.typeParameters,
      innerScope
    );
    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      scopeElement,
      parentScope
    );
    if (node.export)
      putElementInExports(
        this.program,
        this.currentModule,
        node.name,
        scopeElement,
        parent
      );
  }

  override visitTypeDeclarationStatement(node: TypeDeclarationStatement): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const scopeElement = createNewScopeElement(
      node,
      ScopeElementType.TypeDeclaration,
      parentScope
    );

    putTypeParametersInScope(
      this.program,
      this.currentModule,
      node.typeParameters,
      innerScope
    );
    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      scopeElement,
      parentScope
    );
  }

  override visitMethodClassMember(node: MethodClassMember): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const element = createNewScopeElement(
      node,
      ScopeElementType.Method,
      innerScope
    );

    putTypeParametersInScope(
      this.program,
      this.currentModule,
      node.typeParameters,
      innerScope
    );

    this.stack.push(element);
    super.visitMethodClassMember(node);
    this.stack.pop();
  }

  override visitAsyncBlockLiteral(node: AsyncBlockLiteral): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const element = createNewScopeElement(
      node,
      ScopeElementType.AsyncBlock,
      innerScope
    );

    this.stack.push(element);
    super.visitAsyncBlockLiteral(node);
    this.stack.pop();
  }

  override visitBlockStatement(node: BlockStatement): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const element = createNewScopeElement(
      node,
      ScopeElementType.Block,
      innerScope
    );

    this.stack.push(element);
    super.visitBlockStatement(node);
    this.stack.pop();
  }

  override visitConstructorClassMember(node: ConstructorClassMember): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const element = createNewScopeElement(
      node,
      ScopeElementType.Constructor,
      innerScope
    );

    this.stack.push(element);
    super.visitConstructorClassMember(node);
    this.stack.pop();
  }

  override visitExternDeclaration(node: ExternDeclaration): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const element = createNewScopeElement(
      node,
      ScopeElementType.Extern,
      innerScope
    );

    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      element,
      parentScope
    );

    if (node.export)
      putElementInExports(
        this.program,
        this.currentModule,
        node.name,
        element,
        parent
      );
    this.stack.push(element);
    super.visitExternDeclaration(node);
    this.stack.pop();
  }

  override visitFunctionLiteral(node: FunctionLiteral): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const element = createNewScopeElement(
      node,
      ScopeElementType.Function,
      innerScope
    );

    this.stack.push(element);
    super.visitFunctionLiteral(node);
    this.stack.pop();
  }

  override visitGetterClassMember(node: GetterClassMember): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const element = createNewScopeElement(
      node,
      ScopeElementType.ClassGetter,
      innerScope
    );

    this.stack.push(element);
    super.visitGetterClassMember(node);
    this.stack.pop();
  }

  override visitSetterClassMember(node: SetterClassMember): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const element = createNewScopeElement(
      node,
      ScopeElementType.ClassSetter,
      innerScope
    );

    this.stack.push(element);
    super.visitSetterClassMember(node);
    this.stack.pop();
  }

  override visitGrabStatement(node: GrabStatement): void {
    const parent = assert(
      this.stack.at(-1),
      "The parent must exist at this point."
    );
    const parentScope = assert(
      parent.scope,
      "The parent scope must exist at this point."
    );
    const innerScope = createNewScope(parentScope);
    attachScopeToNode(node, innerScope);
    const grabbedScopeElement = createNewScopeElement(
      node,
      ScopeElementType.GrabbedVariable,
      innerScope
    );

    putElementInScope(
      this.program,
      this.currentModule,
      node.name,
      grabbedScopeElement,
      innerScope
    );

    this.stack.push(grabbedScopeElement);
    super.visitGrabStatement(node);
    this.stack.pop();
  }
}
