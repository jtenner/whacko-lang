import { ValidationAcceptor, ValidationChecks } from "langium";
import * as AST from "./generated/ast";
import type { WhackoServices } from "./whacko-module";

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: WhackoServices) {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.WhackoValidator;
  const checks: ValidationChecks<AST.WhackoAstType> = {
    BinaryExpression: validator.checkBinaryExpression,
    // Person: validator.checkPersonStartsWithCapital
  };
  registry.register(checks, validator);
}

const assignmentnOperators = new Set<string>([
  "=",
  "+=",
  "-=",
  "**=",
  "*=",
  "/=",
  "%=",
  "<<=",
  ">>=",
  "&=",
  "^=",
  "|=",
  "&&=",
  "||=",
  "??=",
]);

/**
 * Implementation of custom validations.
 */
export class WhackoValidator {
  checkBinaryExpression(
    path: AST.BinaryExpression,
    accept: ValidationAcceptor
  ): void {
    if (assignmentnOperators.has(path.op)) {
      let lhs = path.lhs;
      // @ts-expect-error
      if (lhs.$type !== "MemberAccessExpression" || lhs.$type !== "ID") {
        accept(
          "error",
          "Left hand side of assignment operation must be valid.",
          {
            node: path,
            property: "lhs",
          }
        );
      }
    }
  }
  // checkPersonStartsWithCapital(person: Person, accept: ValidationAcceptor): void {
  //     if (person.name) {
  //         const firstChar = person.name.substring(0, 1);
  //         if (firstChar.toUpperCase() !== firstChar) {
  //             accept('warning', 'Person name should start with a capital.', { node: person, property: 'name' });
  //         }
  //     }
  // }
}
