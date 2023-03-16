import {
  CompileTimeBool,
  CompileTimeFloat,
  CompileTimeInteger,
  CompileTimeInvalid,
  CompileTimeValue,
  RuntimeValue,
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

  program.addBuiltin("AShr",  ({ ctx, typeParameters, parameters, ast, pass, program }: BuiltinFunctionProps) => {
    const [numberType] = typeParameters;
    const [value, bits] = parameters;
    if (numberType instanceof IntegerType) {
      // we are good
      if (value instanceof CompileTimeInteger && bits instanceof CompileTimeInteger) {
        const resultValue = numberType.isSigned
          ? BigInt.asIntN(numberType.bits, value.value >> bits.value)
          : BigInt.asUintN(numberType.bits, value.value >> bits.value);
      
        ctx.stack.push(new CompileTimeInteger(resultValue, new IntegerType(numberType.ty as IntegerEnumType, resultValue, ast)));
      } else {
        const compiledValue = pass.ensureCompiled(value);
        const compiledBits = pass.ensureCompiled(bits);
        const tmpNamePtr = program.LLVMUtil.lower(pass.getTempName());
        const ref = pass.LLVM._LLVMBuildAShr(pass.builder, compiledValue.ref, compiledBits.ref, tmpNamePtr);
        pass.LLVM._free(tmpNamePtr);
        ctx.stack.push(new RuntimeValue(ref, numberType));
      }
    } else {
      pass.error("Type", ast, `Operation not supported, AShr requires integer types.`);
      ctx.stack.push(new CompileTimeInvalid(ast));
    }
  });

  program.addBuiltin("Select", ({ parameters, typeParameters, ctx, pass }) => {
    const [cond, then, otherwise] = parameters;
    const [type] = typeParameters;
    if (cond instanceof CompileTimeBool) {
      ctx.stack.push(cond ? then : otherwise);
    } else {
      const compiledCond = pass.ensureCompiled(cond);
      const compiledThen = pass.ensureCompiled(then);
      const compiledOtherwise = pass.ensureCompiled(otherwise);

      const namePtr = program.LLVMUtil.lower(pass.getTempName());
      const ref = program.LLVM._LLVMBuildSelect(pass.builder, compiledCond.ref, compiledThen.ref, compiledOtherwise.ref, namePtr);
      pass.LLVM._free(namePtr);
      ctx.stack.push(new RuntimeValue(ref, type));
    }
  });

  program.addBuiltin("Unreachable", ({ ctx, ast, pass }) => {

    // we want the code to exist afterwards so we need to generate two blocks
    const unreachableLabelName = pass.program.LLVMUtil.lower(pass.getTempName());
    const unreachableLabel = pass.LLVM._LLVMAppendBasicBlockInContext(pass.program.llvmContext, pass.func.funcRef, unreachableLabelName);
    
    const nextLabelName = pass.program.LLVMUtil.lower(pass.getTempName());
    const nextLabel = pass.LLVM._LLVMAppendBasicBlockInContext(pass.program.llvmContext, pass.func.funcRef, nextLabelName);

    // we need to 
    const trueRef = pass.LLVM._LLVMConstInt(pass.LLVM._LLVMIntType(1) ,1n, 0);
    pass.LLVM._LLVMBuildCondBr(pass.builder, trueRef, unreachableLabel, nextLabel);

    // create an unreachable label 
    pass.LLVM._LLVMPositionBuilderAtEnd(pass.builder, unreachableLabel);
    ctx.stack.push(new CompileTimeInvalid(ast));
    pass.LLVM._LLVMBuildUnreachable(pass.builder);
    
    // then start building in the after label (which is never jumped too)
    pass.LLVM._LLVMPositionBuilderAtEnd(pass.builder, nextLabel);

    pass.LLVM._free(unreachableLabelName);
    pass.LLVM._free(nextLabelName);
  });
}
