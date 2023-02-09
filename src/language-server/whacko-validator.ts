import { ValidationChecks } from 'langium';
import * as AST from './generated/ast';
import type { WhackoServices } from './whacko-module';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: WhackoServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.WhackoValidator;
    const checks: ValidationChecks<AST.WhackoAstType> = {
        // Person: validator.checkPersonStartsWithCapital
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class WhackoValidator {

    // checkPersonStartsWithCapital(person: Person, accept: ValidationAcceptor): void {
    //     if (person.name) {
    //         const firstChar = person.name.substring(0, 1);
    //         if (firstChar.toUpperCase() !== firstChar) {
    //             accept('warning', 'Person name should start with a capital.', { node: person, property: 'name' });
    //         }
    //     }
    // }

}
