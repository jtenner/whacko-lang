import {
  CompileTimeBool,
  CompileTimeFloat,
  CompileTimeInteger,
  CompileTimeInvalid,
  CompileTimeString,
  CompileTimeValue,
  CompileTimeVoid,
  ExecutionContextValue,
  RuntimeValue,
} from "./execution-context";
import { CallExpression, isCallExpression, Parameter } from "./generated/ast";
import { WhackoProgram } from "./program";
import {
  BuiltinFunctionProps,
  BuiltinTypeFunctionProps,
  ConcreteType,
  FloatType,
  IntegerEnumType,
  IntegerType,
  InvalidType,
  PointerType,
  simdOf,
  SIMDType,
  StringType,
  Type,
  VoidType,
  ConcreteClass,
} from "./types";
import { assert } from "./util";

const simdInitialize = (typeEnum: Type) =>
  ({ ast, pass, program, ctx, parameters }: BuiltinFunctionProps) => {
    const numberType = typeEnum === Type.f32 || typeEnum === Type.f64
      ? new FloatType(typeEnum, null, ast)
      : new IntegerType(typeEnum as IntegerEnumType, null, ast);
    const llvmIntType = numberType.llvmType(program.LLVM, program.LLVMUtil)!;
    const simdType = simdOf(numberType);
    const undef = pass.LLVM._LLVMGetUndef(simdType.llvmType(program.LLVM, program.LLVMUtil)!);
    const laneCount = 16n / numberType.size;
    
    for (let i = 0; i < laneCount; i++) {
      if (numberType.isEqual(parameters[i].ty)) continue;
      ctx.stack.push(new RuntimeValue(undef, simdType));
      return;
    }

    let running = undef;
    for (let i = 0; i < laneCount; i++) {
      const name = program.LLVMUtil.lower(pass.getTempName());
      running = pass.LLVM._LLVMBuildInsertElement(
        pass.builder,
        running,
        pass.ensureCompiled(parameters[0]).ref,
        pass.LLVM._LLVMConstInt(llvmIntType, 0n, 0),
        name,
      );
    }
    
    ctx.stack.push(new RuntimeValue(running, simdType));
  };

const integerCast =
  (size: number, ty: IntegerEnumType, signed: boolean) =>
  ({ ctx, ast, parameters, typeParameters, pass }: BuiltinFunctionProps) => {
    const [value] = parameters;
    const [parameterType] = typeParameters;
    const intType = new IntegerType(ty, null, ast);

    if (
      value.ty.isEqual(parameterType) &&
      parameterType.isNumeric
    ) {
      const derefedValue = pass.ensureDereferenced(value);

      if (derefedValue instanceof CompileTimeInteger || derefedValue instanceof CompileTimeFloat) {
        // we are good to go
        const intValue = signed
          ? BigInt.asIntN(size, BigInt(derefedValue.value))
          : BigInt.asUintN(size, BigInt(derefedValue.value));
        ctx.stack.push(
          new CompileTimeInteger(intValue, intType)
        );
      } else if (
        derefedValue instanceof RuntimeValue
          && (derefedValue.ty instanceof IntegerType || derefedValue.ty instanceof FloatType)
      ) {
        const name = pass.getTempNameRef();
        const ref = pass.LLVM._LLVMBuildIntCast2(
          pass.builder,
          derefedValue.ref,
          intType.llvmType(pass.LLVM, pass.program.LLVMUtil)!,
          intType.isSigned ? 1 : 0,
          name,
        );
        ctx.stack.push(new RuntimeValue(ref, intType));
        pass.LLVM._free(name);
      } else {
        pass.error("Type", ast, `Cannot cast non-integer value to integer.`);
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    } else {
      ctx.stack.push(new CompileTimeInvalid(ast));
    }
  };

const floatCast =
  (size: number, ty: Type.f32 | Type.f64) => 
  ({ ctx, ast, parameters, typeParameters, pass }: BuiltinFunctionProps) => {
    const [value] = parameters;
    const [parameterType] = typeParameters;
    const floatType = new FloatType(ty, null, ast);

    if (
      value.ty.isEqual(parameterType) &&
      parameterType.isNumeric
    ) {
      const derefedValue = pass.ensureDereferenced(value);

      if (derefedValue instanceof CompileTimeInteger || derefedValue instanceof CompileTimeFloat) {
        // we are good to go
        const floatValue = Number(derefedValue.value);
        ctx.stack.push(
          new CompileTimeFloat(floatValue, floatType)
        );
      } else if (
        derefedValue instanceof RuntimeValue
        && (derefedValue.ty instanceof IntegerType || derefedValue.ty instanceof FloatType)
      ) {
        const name = pass.getTempNameRef();
        const ref = pass.LLVM._LLVMBuildFPCast(
          pass.builder,
          derefedValue.ref,
          floatType.llvmType(pass.LLVM, pass.program.LLVMUtil)!,
          name,
        );
        ctx.stack.push(new RuntimeValue(ref, floatType));
        pass.LLVM._free(name);
      } else {
        ctx.stack.push(new CompileTimeInvalid(ast));
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

  program.addBuiltin(
    "AShr",
    ({
      ctx,
      typeParameters,
      parameters,
      ast,
      pass,
      program,
    }: BuiltinFunctionProps) => {
      const [numberType] = typeParameters;
      const [value, bits] = parameters;
      if (numberType instanceof IntegerType) {
        // we are good
        if (
          value instanceof CompileTimeInteger &&
          bits instanceof CompileTimeInteger
        ) {
          const resultValue = numberType.isSigned
            ? BigInt.asIntN(numberType.bits, value.value >> bits.value)
            : BigInt.asUintN(numberType.bits, value.value >> bits.value);

          ctx.stack.push(
            new CompileTimeInteger(
              resultValue,
              new IntegerType(
                numberType.ty as IntegerEnumType,
                resultValue,
                ast
              )
            )
          );
        } else {
          const compiledValue = pass.ensureCompiled(value);
          const compiledBits = pass.ensureCompiled(bits);
          const tmpNamePtr = program.LLVMUtil.lower(pass.getTempName());
          const ref = pass.LLVM._LLVMBuildAShr(
            pass.builder,
            compiledValue.ref,
            compiledBits.ref,
            tmpNamePtr
          );
          pass.LLVM._free(tmpNamePtr);
          ctx.stack.push(new RuntimeValue(ref, numberType));
        }
      } else {
        pass.error(
          "Type",
          ast,
          `Operation not supported, AShr requires integer types.`
        );
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    }
  );

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
      const ref = program.LLVM._LLVMBuildSelect(
        pass.builder,
        compiledCond.ref,
        compiledThen.ref,
        compiledOtherwise.ref,
        namePtr
      );
      pass.LLVM._free(namePtr);
      ctx.stack.push(new RuntimeValue(ref, type));
    }
  });

  program.addBuiltin("Unreachable", ({ ctx, ast, pass }) => {
    // we want the code to exist afterwards so we need to generate two blocks
    const unreachableLabelName = pass.program.LLVMUtil.lower(
      pass.getTempName()
    );
    const unreachableLabel = pass.LLVM._LLVMAppendBasicBlockInContext(
      pass.program.llvmContext,
      pass.func.funcRef,
      unreachableLabelName
    );

    const nextLabelName = pass.program.LLVMUtil.lower(pass.getTempName());
    const nextLabel = pass.LLVM._LLVMAppendBasicBlockInContext(
      pass.program.llvmContext,
      pass.func.funcRef,
      nextLabelName
    );

    // we need to make a branch to an unreachable so that we can continue compilation
    const trueRef = pass.LLVM._LLVMConstInt(pass.LLVM._LLVMIntType(1), 1n, 0);
    pass.LLVM._LLVMBuildCondBr(
      pass.builder,
      trueRef,
      unreachableLabel,
      nextLabel
    );

    // create an unreachable label
    pass.LLVM._LLVMPositionBuilderAtEnd(pass.builder, unreachableLabel);
    ctx.stack.push(new CompileTimeInvalid(ast));
    pass.LLVM._LLVMBuildUnreachable(pass.builder);

    // then start building in the after label (which is never jumped too)
    pass.LLVM._LLVMPositionBuilderAtEnd(pass.builder, nextLabel);

    pass.LLVM._free(unreachableLabelName);
    pass.LLVM._free(nextLabelName);
  });

  program.addBuiltin(
    "And",
    ({ typeParameters, parameters, pass, ast, ctx, program }) => {
      const [numberType] = typeParameters;
      const [lhs, rhs] = parameters;
      if (numberType instanceof IntegerType && lhs.ty.isEqual(rhs.ty)) {
        if (
          lhs instanceof CompileTimeInteger &&
          rhs instanceof CompileTimeInteger
        ) {
          // we perform a compile time add
          const resultValue = numberType.isSigned
            ? BigInt.asIntN(numberType.bits, lhs.value & rhs.value)
            : BigInt.asUintN(numberType.bits, lhs.value & rhs.value);
          ctx.stack.push(
            new CompileTimeInteger(
              resultValue,
              new IntegerType(lhs.ty.ty as IntegerEnumType, resultValue, ast)
            )
          );
          return;
        }

        const compiledLHS = pass.ensureCompiled(lhs);
        const compiledRHS = pass.ensureCompiled(rhs);

        const addName = program.LLVMUtil.lower(pass.getTempName());

        const ref = pass.LLVM._LLVMBuildAnd(
          pass.builder,
          compiledLHS.ref,
          compiledRHS.ref,
          addName
        );

        ctx.stack.push(
          new RuntimeValue(
            ref,
            new IntegerType(lhs.ty.ty as IntegerEnumType, null, ast)
          )
        );
        pass.LLVM._free(addName);
      } else {
        pass.error("Type", ast, `Add type not supported, must be integer.`);
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    }
  );

  program.addBuiltin(
    "FAdd",
    ({ typeParameters, parameters, pass, ast, ctx, program }) => {
      const [numberType] = typeParameters;
      const [lhs, rhs] = parameters;
      if (numberType instanceof FloatType && lhs.ty.isEqual(rhs.ty)) {
        if (
          lhs instanceof CompileTimeFloat &&
          rhs instanceof CompileTimeFloat
        ) {
          // we perform a compile time add
          const resultValue = lhs.value + rhs.value;
          ctx.stack.push(
            new CompileTimeFloat(
              resultValue,
              new FloatType(lhs.ty.ty as Type.f32 | Type.f64, resultValue, ast)
            )
          );
          return;
        }

        const compiledLHS = pass.ensureCompiled(lhs);
        const compiledRHS = pass.ensureCompiled(rhs);

        const addName = program.LLVMUtil.lower(pass.getTempName());

        const ref = pass.LLVM._LLVMBuildFAdd(
          pass.builder,
          compiledLHS.ref,
          compiledRHS.ref,
          addName
        );

        ctx.stack.push(
          new RuntimeValue(
            ref,
            new FloatType(lhs.ty.ty as Type.f32 | Type.f64, null, ast)
          )
        );
        pass.LLVM._free(addName);
      } else {
        pass.error("Type", ast, `Add type not supported, must be integer.`);
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    }
  );

  program.addBuiltin(
    "Add",
    ({ typeParameters, parameters, pass, ast, ctx, program }) => {
      const [numberType] = typeParameters;
      const [lhs, rhs] = parameters;
      if (numberType instanceof IntegerType && lhs.ty.isEqual(rhs.ty)) {
        if (
          lhs instanceof CompileTimeInteger &&
          rhs instanceof CompileTimeInteger
        ) {
          // we perform a compile time add
          const resultValue = numberType.isSigned
            ? BigInt.asIntN(numberType.bits, lhs.value + rhs.value)
            : BigInt.asUintN(numberType.bits, lhs.value + rhs.value);
          ctx.stack.push(
            new CompileTimeInteger(
              resultValue,
              new IntegerType(lhs.ty.ty as IntegerEnumType, resultValue, ast)
            )
          );
          return;
        }

        const compiledLHS = pass.ensureCompiled(lhs);
        const compiledRHS = pass.ensureCompiled(rhs);

        const addName = program.LLVMUtil.lower(pass.getTempName());

        const ref = pass.LLVM._LLVMBuildAdd(
          pass.builder,
          compiledLHS.ref,
          compiledRHS.ref,
          addName
        );

        ctx.stack.push(
          new RuntimeValue(
            ref,
            new IntegerType(lhs.ty.ty as IntegerEnumType, null, ast)
          )
        );
        pass.LLVM._free(addName);
      } else {
        pass.error("Type", ast, `Add type not supported, must be integer.`);
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    }
  );

  program.addBuiltin(
    "Sub",
    ({ typeParameters, parameters, pass, ast, ctx, program }) => {
      const [numberType] = typeParameters;
      const [lhs, rhs] = parameters;
      if (numberType instanceof IntegerType && lhs.ty.isEqual(rhs.ty)) {
        if (
          lhs instanceof CompileTimeInteger &&
          rhs instanceof CompileTimeInteger
        ) {
          // we perform a compile time add
          const resultValue = numberType.isSigned
            ? BigInt.asIntN(numberType.bits, lhs.value - rhs.value)
            : BigInt.asUintN(numberType.bits, lhs.value - rhs.value);
          ctx.stack.push(
            new CompileTimeInteger(
              resultValue,
              new IntegerType(lhs.ty.ty as IntegerEnumType, resultValue, ast)
            )
          );
          return;
        }

        const compiledLHS = pass.ensureCompiled(lhs);
        const compiledRHS = pass.ensureCompiled(rhs);

        const subName = program.LLVMUtil.lower(pass.getTempName());

        const ref = pass.LLVM._LLVMBuildSub(
          pass.builder,
          compiledLHS.ref,
          compiledRHS.ref,
          subName
        );

        ctx.stack.push(
          new RuntimeValue(
            ref,
            new IntegerType(lhs.ty.ty as IntegerEnumType, null, ast)
          )
        );
        pass.LLVM._free(subName);
      } else {
        pass.error("Type", ast, `Sub type not supported, must be integer.`);
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    }
  );

  program.addBuiltin(
    "Mul",
    ({ typeParameters, parameters, pass, ast, ctx, program }) => {
      const [numberType] = typeParameters;
      const [lhs, rhs] = parameters;
      if (numberType instanceof IntegerType && lhs.ty.isEqual(rhs.ty)) {
        if (
          lhs instanceof CompileTimeInteger &&
          rhs instanceof CompileTimeInteger
        ) {
          // we perform a compile time add
          const resultValue = numberType.isSigned
            ? BigInt.asIntN(numberType.bits, lhs.value * rhs.value)
            : BigInt.asUintN(numberType.bits, lhs.value * rhs.value);
          ctx.stack.push(
            new CompileTimeInteger(
              resultValue,
              new IntegerType(lhs.ty.ty as IntegerEnumType, resultValue, ast)
            )
          );
          return;
        }

        const compiledLHS = pass.ensureCompiled(lhs);
        const compiledRHS = pass.ensureCompiled(rhs);

        const subName = program.LLVMUtil.lower(pass.getTempName());

        const ref = pass.LLVM._LLVMBuildMul(
          pass.builder,
          compiledLHS.ref,
          compiledRHS.ref,
          subName
        );

        ctx.stack.push(
          new RuntimeValue(
            ref,
            new IntegerType(lhs.ty.ty as IntegerEnumType, null, ast)
          )
        );
        pass.LLVM._free(subName);
      } else {
        pass.error("Type", ast, `Mul type not supported, must be integer.`);
        ctx.stack.push(new CompileTimeInvalid(ast));
      }
    }
  );

  program.addBuiltin(
    "alloca",
    ({ program, parameters, pass, ctx, ast }) => {
      const { LLVM, LLVMUtil } = program;
      const voidType = new VoidType(ast);
      const ptrType = new PointerType(voidType, ast);
      const usizeType = new IntegerType(Type.usize, null, ast);
      const [size] = parameters; 
      const compiledValue = pass.ensureCompiled(size);
      const name = pass.getTempNameRef();
      const ptrRef = LLVM._LLVMBuildArrayAlloca(
        pass.builder,
        ptrType.llvmType(LLVM, LLVMUtil)!,
        compiledValue.ref,
        name
      );
      LLVM._free(name);

      const resultName = pass.getTempNameRef();
      const resultRef = LLVM._LLVMBuildPtrToInt(
        pass.builder,
        ptrRef,
        usizeType.llvmType(LLVM, LLVMUtil)!,
        resultName,
      );
      LLVM._free(resultName);

      ctx.stack.push(new RuntimeValue(resultRef, usizeType));
    }
  );

  program.addBuiltin(
    "malloc",
    ({ program, parameters, pass, ctx, ast }) => {
      const voidType = new VoidType(ast);
      const ptrType = new PointerType(voidType, ast);
      const usizeType = new IntegerType(Type.usize, null, ast);
      const { LLVM, LLVMUtil } = program;
      const [size] = parameters;
      assert(size.ty.isEqual(usizeType), "The type here must be usize.");
      const compiledSize = pass.ensureCompiled(size);
      const name = pass.getTempNameRef();
      const resultRef = pass.LLVM._LLVMBuildArrayMalloc(
        pass.builder,
        ptrType.llvmType(LLVM, LLVMUtil)!,
        compiledSize.ref,
        name,
      );
      LLVM._free(name);
      ctx.stack.push(new RuntimeValue(resultRef, usizeType));
    }
  );

  program.addBuiltin("Log", ({ program, parameters, pass, ctx, ast }) => {
    const [strParameter] = parameters;

    if (strParameter instanceof CompileTimeString) {
      console.log(strParameter.value);
    } else {
      pass.error("Semantic", ast, "Log only accepts compile time strings.");
    }
  });

  program.addBuiltin(
    "ptr",
    ({ program, parameters, typeParameters, pass, ctx, ast }) =>{
      const { LLVM, LLVMUtil } = program;
      const [classType] = typeParameters;
      const [ptr] = parameters;
      const usizeType = new IntegerType(Type.usize, null, ast);

      if (classType instanceof StringType) {
        const compiledPtr = pass.ensureCompiled(ptr);
        const ref = compiledPtr.ref;
        const name = pass.getTempNameRef();
        const resultRef = LLVM._LLVMBuildPtrToInt(
          pass.builder,
          ref,
          usizeType.llvmType(LLVM, LLVMUtil)!,
          name
        );
        LLVM._free(name);
        ctx.stack.push(new RuntimeValue(resultRef, usizeType));
      } else if (classType instanceof ConcreteClass) {
        const derefedPtr = pass.ensureDereferenced(ptr);
        assert(derefedPtr instanceof RuntimeValue);
        const ref = (derefedPtr as RuntimeValue).ref;
        const name = pass.getTempNameRef();
        const resultRef = LLVM._LLVMBuildPtrToInt(
          pass.builder,
          ref,
          usizeType.llvmType(LLVM, LLVMUtil)!,
          name
        );
        LLVM._free(name);
        ctx.stack.push(new RuntimeValue(resultRef, usizeType));
      } else {
        ctx.stack.push(new CompileTimeInvalid(ast));
        pass.error("Type", ast, `Cannot convert value to pointer, ${classType.getName()} is not a class.`);
      }
    }
  );

  program.addBuiltin(
    "load",
    ({ program, parameters, typeParameters, pass, ctx, ast }) => {
      const { LLVM, LLVMUtil } = program;
      const [type] = typeParameters;
      const [param] = parameters;

      if (type.isNumeric) {
        const ptrType = new PointerType(new VoidType(ast), ast);
        const numRef = pass.ensureCompiled(param);

        const ptrRefName = pass.getTempNameRef();
        const ptrRef = LLVM._LLVMBuildIntToPtr(
          pass.builder,
          numRef.ref,
          ptrType.llvmType(LLVM, LLVMUtil)!,
          ptrRefName
        );
        LLVM._free(ptrRefName);

        const resultName = pass.getTempNameRef();
        const resultRef = LLVM._LLVMBuildLoad2(
          pass.builder,
          type.llvmType(LLVM, LLVMUtil)!,
          ptrRef,
          resultName
        );
        LLVM._free(resultName);
        ctx.stack.push(new RuntimeValue(resultRef, type));
      } else {
        ctx.stack.push(new CompileTimeInvalid(ast));
        pass.error("Type", ast, "Cannot load non-numeric type.");
      }
    }
  );

  program.addBuiltin(
    "store",
    ({ program, parameters, typeParameters, pass, ctx, ast }) => {
      const [ptr, value] = parameters;
      const compiledPtr = pass.ensureCompiled(ptr);
      const compiledValue = pass.ensureCompiled(value);
      const [type] = typeParameters;
      if (type.isNumeric) {
        const name = program.LLVMUtil.lower(pass.getTempName());
        const type = program.LLVM._LLVMPointerType(
          program.LLVM._LLVMVoidType(),
          0
        );
        const ptrCast = program.LLVM._LLVMBuildIntToPtr(
          pass.builder,
          compiledPtr.ref,
          type,
          name
        );
        program.LLVM._LLVMBuildStore(pass.builder, compiledValue.ref, ptrCast);
        program.LLVM._free(name);
      } else {
        pass.error(
          "Type",
          ast,
          `Invalid store operation, value to be stored must be numeric.`
        );
      }
      ctx.stack.push(new CompileTimeVoid(ast));
    }
  );

  const isUsize = (val: ExecutionContextValue) => {
    return val.ty instanceof IntegerType && val.ty.ty === Type.usize;
  };
  program.addBuiltin("MemCopy", ({ program, pass, parameters }) => {
    const [src, dest, count] = parameters;
    if (isUsize(src) && isUsize(dest) && isUsize(count)) {
      const compiledSrc = pass.ensureCompiled(src);
      const compiledDest = pass.ensureCompiled(dest);
      const compiledCount = pass.ensureCompiled(count);

      const ptrType = pass.LLVM._LLVMPointerType(pass.LLVM._LLVMVoidType(), 0);
      const ptrSrcCastName = program.LLVMUtil.lower(pass.getTempName());
      const ptrSrc = pass.LLVM._LLVMBuildIntToPtr(
        pass.builder,
        compiledSrc.ref,
        ptrType,
        ptrSrcCastName
      );

      const ptrDestCastName = program.LLVMUtil.lower(pass.getTempName());
      const ptrDest = pass.LLVM._LLVMBuildIntToPtr(
        pass.builder,
        compiledDest.ref,
        ptrType,
        ptrDestCastName
      );

      pass.LLVM._LLVMBuildMemCpy(
        pass.builder,
        ptrDest,
        1,
        ptrSrc,
        1,
        compiledCount.ref
      );
      pass.LLVM._free(ptrSrcCastName);
      pass.LLVM._free(ptrDestCastName);
    }
  });

  program.addBuiltin("free", ({ ctx, pass, typeParameters, parameters, ast, program }) => {
    const { LLVM, LLVMUtil } = program;
    const [typeParameter] = typeParameters;
    const [ptr] = parameters;
    const usizeType = new IntegerType(Type.usize, null, ast);
    const voidType = new VoidType(ast);
    const ptrType = new PointerType(voidType, ast);

    // free class, already pointer
    if (typeParameter instanceof ConcreteClass) {
      const derefPtr = pass.ensureDereferenced(ptr);
      // class types are always compiled
      assert(derefPtr instanceof RuntimeValue, "We must be a runtime value at this point");
      const ref = (derefPtr as RuntimeValue).ref;
      LLVM._LLVMBuildFree(pass.builder, ref);
      // usize
    } else if (typeParameter.isEqual(usizeType)) {
      const derefedPtr = pass.ensureCompiled(ptr);
      const ptrCastName = pass.getTempNameRef();
      const ptrCast = LLVM._LLVMBuildIntToPtr(
        pass.builder,
        derefedPtr.ref,
        ptrType.llvmType(LLVM, LLVMUtil)!,
        ptrCastName
      );
      LLVM._free(ptrCastName);
      LLVM._LLVMBuildFree(pass.builder, ptrCast);
    }

    ctx.stack.push(new CompileTimeVoid(ast));
  });

  program.addBuiltin("Splat", ({ typeParameters, parameters, ast, program, pass, ctx }) => {
    const [splatType] = typeParameters;
    const [value] = parameters;
    if (value.ty.isEqual(splatType) && splatType.isNumeric) {
      const laneCount = Number(16n / splatType.size);
      const simdType = simdOf(splatType);
      const llvmSimdType = simdType.llvmType(program.LLVM, program.LLVMUtil)!;
      const compiledValue = pass.ensureCompiled(value);
      const i32Type = new IntegerType(Type.i32, 0n, ast).llvmType(program.LLVM, program.LLVMUtil)!;

      const undef = pass.LLVM._LLVMGetUndef(llvmSimdType);
      let runningElement = undef;

      for (let i = 0; i < laneCount; i++) {
        const index = pass.LLVM._LLVMConstInt(i32Type, BigInt(i), 0)
        const name = program.LLVMUtil.lower(pass.getTempName()); 
        runningElement = pass.LLVM._LLVMBuildInsertElement(
          pass.builder,
          runningElement,
          compiledValue.ref,
          index,
          name,
        );
        pass.LLVM._free(name);
      }

      ctx.stack.push(new RuntimeValue(runningElement, simdType));
    }
  });

  program.addBuiltin("i8x16", simdInitialize(Type.i8));
  program.addBuiltin("u8x16", simdInitialize(Type.u8));
  program.addBuiltin("i16x8", simdInitialize(Type.i16));
  program.addBuiltin("u16x8", simdInitialize(Type.u16));
  program.addBuiltin("i32x4", simdInitialize(Type.i32));
  program.addBuiltin("u32x4", simdInitialize(Type.u32));
  program.addBuiltin("f32x4", simdInitialize(Type.f32));
  program.addBuiltin("i64x2", simdInitialize(Type.i64));
  program.addBuiltin("u64x2", simdInitialize(Type.u64));
  program.addBuiltin("f64x2", simdInitialize(Type.f64));

  program.addBuiltinType("v128", ({ typeParameters, ast }) => {
    const [param] = typeParameters;
    if (param.isNumeric) {
      return simdOf(param);
    }
    return new InvalidType(ast);
  });

  program.addBuiltin("isString", ({ typeParameters, ast, parameters, ctx }) => {
    const [param] = parameters;
    const [typeParam] = typeParameters;
    const isStringType = param.ty instanceof StringType && typeParam instanceof StringType;

    ctx.stack.push(new CompileTimeBool(isStringType, ast));
  });

  program.addBuiltin("f32", floatCast(32, Type.f32));
  program.addBuiltin("f64", floatCast(64, Type.f64));
}
