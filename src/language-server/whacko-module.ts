import {
  createDefaultModule,
  createDefaultSharedModule,
  DefaultSharedModuleContext,
  inject,
  LangiumServices,
  LangiumSharedServices,
  Module,
  PartialLangiumServices,
} from "langium";
import {
  WhackoGeneratedModule,
  WhackoGeneratedSharedModule,
} from "./generated/module";
import { WhackoValidator, registerValidationChecks } from "./whacko-validator";

/**
 * Declaration of custom services - add your own service classes here.
 */
export type WhackoAddedServices = {
  validation: {
    WhackoValidator: WhackoValidator;
  };
};

/**
 * Union of Langium default services and your custom services - use this as constructor parameter
 * of custom service classes.
 */
export type WhackoServices = LangiumServices & WhackoAddedServices;

/**
 * Dependency injection module that overrides Langium default services and contributes the
 * declared custom services. The Langium defaults can be partially specified to override only
 * selected services, while the custom services must be fully specified.
 */
export const WhackoModule: Module<
  WhackoServices,
  PartialLangiumServices & WhackoAddedServices
> = {
  validation: {
    WhackoValidator: () => new WhackoValidator(),
  },
};

/**
 * Create the full set of services required by Langium.
 *
 * First inject the shared services by merging two modules:
 *  - Langium default shared services
 *  - Services generated by langium-cli
 *
 * Then inject the language-specific services by merging three modules:
 *  - Langium default language-specific services
 *  - Services generated by langium-cli
 *  - Services specified in this file
 *
 * @param context Optional module context with the LSP connection
 * @returns An object wrapping the shared services and the language-specific services
 */
export function createWhackoServices(context: DefaultSharedModuleContext): {
  shared: LangiumSharedServices;
  Whacko: WhackoServices;
} {
  const shared = inject(
    createDefaultSharedModule(context),
    WhackoGeneratedSharedModule,
  );
  const Whacko = inject(
    createDefaultModule({ shared }),
    WhackoGeneratedModule,
    WhackoModule,
  );
  shared.ServiceRegistry.register(Whacko);
  registerValidationChecks(Whacko);
  return { shared, Whacko };
}

