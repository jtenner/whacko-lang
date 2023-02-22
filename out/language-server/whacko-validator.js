"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhackoValidator = exports.registerValidationChecks = void 0;
/**
 * Register custom validation checks.
 */
function registerValidationChecks(services) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.WhackoValidator;
    const checks = {
        BinaryExpression: validator.checkBinaryExpression,
        // Person: validator.checkPersonStartsWithCapital
    };
    registry.register(checks, validator);
}
exports.registerValidationChecks = registerValidationChecks;
const assignmentnOperators = new Set([
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
class WhackoValidator {
    checkBinaryExpression(path, accept) {
        if (assignmentnOperators.has(path.op)) {
            let lhs = path.lhs;
            if (lhs.$type === "PathExpression") {
                const lastItem = lhs.path.at(-1);
                if (lastItem.$type !== "MemberAccessPath") {
                    accept("error", "Left hand side of assignment operation must be valid.", {
                        node: path,
                        property: "lhs",
                    });
                }
            }
        }
    }
}
exports.WhackoValidator = WhackoValidator;
//# sourceMappingURL=whacko-validator.js.map