import { AstNode } from "langium";
import { reportErrorDiagnostic } from "./diagnostic";
import { ID } from "./generated/ast";
import { WhackoModule, WhackoProgram } from "./program";
import { assert } from "./util";

const scopes = new WeakMap<AstNode, Scope>();
let scopeIDs = 0;
let scopeElementIDs = 0;

export interface Exportable {
  exports: Map<string, ScopeElement> | null;
  scope: Scope | null;
}

export interface Scope {
  id: number;
  parent: Scope | null;
  elements: Map<string, ScopeElement>;
}

export function addScopeElement(
  scope: Scope,
  name: string,
  element: ScopeElement
) {
  assert(
    !scope.elements.has(name),
    "Element has already been defined on this scope."
  );
  scope.elements.set(name, element);
}

/** Get the scope for this node. It traverses up the tree until it finds the correct scope. */
export function getScope(node: AstNode): Scope | null {
  while (true) {
    const scope = scopes.get(node);
    if (scope) return scope;

    if (node.$container) {
      node = node.$container;
      continue;
    }

    return null;
  }
}

export function setScope(node: AstNode, scope: Scope) {
  scopes.set(node, scope);
}

export function makeChildScope(scope: Scope): Scope {
  return {
    elements: new Map(),
    id: scopeIDs++,
    parent: scope,
  };
}

export const enum ScopeElementType {
  Class,
  Function,
  Method,
  VariableDeclarator,
  Namespace,
  TypeDeclaration,
  Parameter,
  Builtin,
  NamespaceStub,
  AsyncBlock,
  Enum,
  DeclareFunction,
  BuiltinType,
  Block,
  Extern,
  Constructor,
  ClassSetter,
  ClassGetter,
  GrabbedVariable,
}

export interface ScopeElement {
  exports: Map<string, ScopeElement> | null;
  id: number;
  node: AstNode;
  type: ScopeElementType;
  scope: Scope | null;
}

export function createNewScopeElement(
  node: AstNode,
  type: ScopeElementType,
  scope: Scope | null = null
): ScopeElement {
  return {
    exports: null,
    id: scopeElementIDs++,
    node,
    type,
    scope,
  };
}

export function createNewScope(scope?: Scope): Scope {
  return {
    id: scopeIDs++,
    elements: new Map(),
    parent: scope ?? null,
  };
}

export function isInLocalScope(scope: Scope, name: string): boolean {
  return scope.elements.has(name);
}

export function getElementInScope(
  scope: Scope,
  name: string
): ScopeElement | null {
  if (scope.elements.has(name)) return scope.elements.get(name)!;
  if (scope.parent) return getElementInScope(scope.parent, name);
  return null;
}

export function defineElementInScope(
  scope: Scope,
  name: string,
  element: ScopeElement
) {
  assert(
    !isInLocalScope(scope, name),
    "Element is already defined in this scope."
  );
  scope.elements.set(name, element);
}

export function defineExportInParent(
  exportable: Exportable,
  name: string,
  scopeElement: ScopeElement
) {
  assert(
    !exportable.exports!.has(name),
    `Element ${name} already defined as an export.`
  );
  exportable.exports!.set(name, scopeElement);
}

export function putElementInScope(
  program: WhackoProgram,
  module: WhackoModule,
  name: ID,
  element: ScopeElement,
  scope: Scope
) {
  if (isInLocalScope(scope, name.name)) {
    reportErrorDiagnostic(
      program,
      "scope",
      name,
      module,
      `Element ${name.name} already defined in scope.`
    );
  } else {
    defineElementInScope(scope, name.name, element);
  }
}

export function putElementInExports(
  program: WhackoProgram,
  module: WhackoModule,
  name: ID,
  element: ScopeElement,
  parent: Exportable
) {
  if (parent.exports!.has(name.name)) {
    reportErrorDiagnostic(
      program,
      "scope",
      name,
      module,
      `Element ${name.name} already defined in parent exports.`
    );
  } else {
    defineExportInParent(parent, name.name, element);
  }
}

export function putTypeParametersInScope(
  program: WhackoProgram,
  module: WhackoModule,
  typeParameters: ID[],
  scope: Scope
) {
  for (const typeParameter of typeParameters) {
    const typeParameterElement = createNewScopeElement(
      typeParameter,
      ScopeElementType.TypeDeclaration,
      scope
    );
    putElementInScope(
      program,
      module,
      typeParameter,
      typeParameterElement,
      scope
    );
  }
}
