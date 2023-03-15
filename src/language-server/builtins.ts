import {
  CompileTimeFloat,
  CompileTimeInteger,
  CompileTimeInvalid,
  CompileTimeValue,
} from "./execution-context";
import { CallExpression, isCallExpression } from "./generated/ast";
import { WhackoProgram } from "./program";
import {
  BuiltinFunctionProps,
  IntegerEnumType,
  IntegerType,
  Type,
} from "./types";

const integerCast =
  (size: number, ty: IntegerEnumType, signed: boolean) =>
  ({ ctx, ast, parameters, typeParameters }: BuiltinFunctionProps) => {
    const [value] = parameters;
    const [parameterType] = typeParameters;
    if (
      parameters.length === 1 &&
      typeParameters.length === 1 &&
      value.ty.isEqual(parameterType) &&
      parameterType instanceof IntegerType
    ) {
      if (value instanceof CompileTimeInteger) {
        // we are good to go
        const intValue = signed
          ? BigInt.asIntN(size, value.value)
          : BigInt.asUintN(size, value.value);
        ctx.stack.push(
          new CompileTimeInteger(intValue, new IntegerType(ty, intValue, ast))
        );
      } else {
        // TODO: Implement runtime casting
      }
    } else {
      ctx.stack.push(new CompileTimeInvalid(ast));
    }
  };

export function registerDefaultBuiltins(program: WhackoProgram) {
  program.addBuiltin("i8", integerCast(8, Type.i8, true));
  program.addBuiltin("u8", integerCast(8, Type.u8, false));
  program.addBuiltin("i16", integerCast(16, Type.i16, true));
  program.addBuiltin("u16", integerCast(16, Type.u16, false));
  program.addBuiltin("i32", integerCast(32, Type.i32, true));
  program.addBuiltin("u32", integerCast(32, Type.u32, false));
  program.addBuiltin("i64", integerCast(64, Type.i64, true));
  program.addBuiltin("u64", integerCast(64, Type.u64, false));
  program.addBuiltin("isize", integerCast(32, Type.isize, false));
  program.addBuiltin("usize", integerCast(32, Type.usize, false));
}
