import { assert } from "console";
import {
  CompileTimeFloat,
  CompileTimeInteger,
  CompileTimeInvalid,
  CompileTimeValue,
  RuntimeFloat,
  RuntimeInteger,
  RuntimeInvalid,
} from "./execution-context";
import { CallExpression, isCallExpression } from "./generated/ast";
import { WhackoProgram } from "./program";
import {
  BuiltinFunctionProps,
  ConcreteType,
  IntegerEnumType,
  IntegerType,
  Type,
} from "./types";

function compileTimeCastInteger(value: bigint, size: number, signed: boolean) {
  return signed ? BigInt.asIntN(size, value) : BigInt.asUintN(size, value);
}

const integerCast =
  (name: string, size: number, ty: IntegerEnumType, signed: boolean) =>
  ({ ctx, program, ast, module, pass }: BuiltinFunctionProps) => {
    assert(isCallExpression(ast), "AstNode must be a call expression.");
    const callExpression = ast as CallExpression;

    if (callExpression.parameters.length !== 1) {
      module.error(
        "Type",
        ast,
        `Invalid call to ${name}, must have a single parameter.`
      );
      ctx.stack.push(new CompileTimeInvalid(ast));
      return;
    } else if (callExpression.typeParameters.length > 1) {
      module.error(
        "Type",
        ast,
        `Invalid call to ${name}, function must have no type parameters or a single type parameter.`
      );
      ctx.stack.push(new CompileTimeInvalid(ast));
      return;
    }

    // compile the parameter and push it to the stack
    pass.visit(callExpression.parameters[0]);
    assert(ctx.stack.length > 0, "There must be an item on the stack here.");
    const value = ctx.stack.pop()!;

    // TODO: resolve the type parameter
    const typeParameterNode = callExpression.typeParameters[0];
    if (typeParameterNode) {
      const paramType = ctx.resolve(typeParameterNode) as ConcreteType | null;
      if (paramType) {
        if (value!.ty.isAssignableTo(paramType)) {
          // TODO: What do we do here?
        } else {
          module.error(
            "Type",
            callExpression,
            `Expression is not assignable to generic type.`
          );
          ctx.stack.push(new CompileTimeInvalid(callExpression));
          return;
        }
      } else {
        module.error("Type", typeParameterNode, `Unable to resolve type.`);
        ctx.stack.push(new CompileTimeInvalid(callExpression));
        return;
      }
    }

    if (value instanceof CompileTimeValue) {
      if (value instanceof CompileTimeFloat) {
        const bigintValue = BigInt(value.value);
        const castValue = compileTimeCastInteger(bigintValue, size, signed);
        ctx.stack.push(
          new CompileTimeInteger(castValue, new IntegerType(ty, castValue, ast))
        );
      } else if (value instanceof CompileTimeInteger) {
        const castValue = compileTimeCastInteger(value.value, size, signed);
        ctx.stack.push(
          new CompileTimeInteger(castValue, new IntegerType(ty, castValue, ast))
        );
        // TODO: Add branch for reference pointers maybe?
      } else {
        module.error("Type", ast, `${name} cast must be a number value.`);
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    } else {
      if (value instanceof RuntimeInteger) {
        // TODO: we emit a cast instructions to proper sized integer
        const ref = value.ref;
        const ty = value.ty;
      } else if (value instanceof RuntimeFloat) {
        // TODO: we emit a conversion instructions to integer type
        const ref = value.ref;
        const ty = value.ty;

        // TODO: we emit ptr to integer cast
      } else {
        module.error("Type", ast, `${name} cast must be a number value.`);
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    }
  };

export function registerDefaultBuiltins(program: WhackoProgram) {
  program.addBuiltin("i8", integerCast("i8", 8, Type.i8, true));
  program.addBuiltin("u8", integerCast("u8", 8, Type.u8, false));
  program.addBuiltin("i16", integerCast("i16", 16, Type.i16, true));
  program.addBuiltin("u16", integerCast("u16", 16, Type.u16, false));
  program.addBuiltin("i32", integerCast("i32", 32, Type.i32, true));
  program.addBuiltin("u32", integerCast("U32", 32, Type.u32, false));
  program.addBuiltin("i64", integerCast("i64", 64, Type.i64, true));
  program.addBuiltin("u64", integerCast("u64", 64, Type.u64, false));
  program.addBuiltin("isize", integerCast("isize", 32, Type.isize, false));
  program.addBuiltin("usize", integerCast("usize", 32, Type.usize, false));
}
