import { AstNode } from "langium";
import { FunctionDeclaration, ID, isID } from "./generated/ast";
import { WhackoModule } from "./program";
import { ConcreteType, getTypeName } from "./types";

export function assert<T>(
  condition: T,
  message: string = "No message provided"
) {
  if (!condition) throw new Error(message);
  return condition;
}

export function logNode(node: AstNode) {
  console.log(cleanNode(node));
}

export function cleanNode(node: AstNode): any {
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key, entry]) => key === "$type" || !key.startsWith("$"))
      .map(([key, obj]) => [
        key,
        (obj.constructor === Object ? cleanNode(obj) : obj) as any,
      ])
  );
}

export interface Nameable extends AstNode {
  name: ID;
}

export function getNodeName(node: Nameable): string {
  let accumulatedName: string = node.name.name;
  let accumulator: AstNode = node;
  while (accumulator.$container) {
    accumulator = accumulator.$container!;

    if ("name" in accumulator && isID(accumulator.name)) {
      accumulatedName = accumulator.name.name + "." + accumulatedName;
    }
  }
  return accumulatedName;
}

export function getFullyQualifiedFunctionName(
  node: AstNode,
  typeParameters: ConcreteType[],
  mod: WhackoModule
): string {
  const typeParameterNames = typeParameters
    .map((e) => getTypeName(e))
    .join(",");
  return `[${mod.relativePath}]~${getNodeName(node as FunctionDeclaration)}${
    typeParameters.length ? "<" + typeParameterNames + ">" : ""
  }`;
}
