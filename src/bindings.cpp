
#include <llvm-15/llvm/IR/LLVMContext.h>
#include <llvm-15/llvm/IR/Module.h>
#include <llvm-15/llvm/IR/DataLayout.h>
#include <llvm-15/llvm/Analysis/TargetFolder.h>
#include <llvm-15/llvm/IR/IRBuilder.h>
#include <llvm-15/llvm/IR/Constants.h>
// all the header files are there wtf
#include <emscripten/bind.h>


using namespace emscripten;
using namespace llvm;

#define WRAPPER_LAMBDA(func, return_type, ...) static_cast<return_type (*)(__VA_ARGS__)>(func)

EMSCRIPTEN_BINDINGS(llvm_bindings) {
    class_<llvm::LLVMContext>("LLVMContext")
        .constructor();
    class_<llvm::Module>("Module")
        .constructor<std::string, llvm::LLVMContext&>();

    class_<llvm::ConstantInt>("ConstantInt");
    // class_<llvm::DataLayout>("DataLayout")
    //     .constructor<llvm::Module*>();
    // class_<llvm::TargetFolder>("TargetFolder")
    //     .constructor<llvm::DataLayout>();
    class_<llvm::IRBuilder<llvm::TargetFolder>>("IRBuilder")
        // .constructor<llvm::LLVMContext&, llvm::TargetFolder>();
        // .allow_subclass<IRBuilderBase>("BaseWrapper")
        .constructor(WRAPPER_LAMBDA([](auto context, auto module) {
            return new llvm::IRBuilder<llvm::TargetFolder>(context, llvm::TargetFolder(*new llvm::DataLayout(module)));
        }, llvm::IRBuilder<llvm::TargetFolder>*, llvm::LLVMContext&, llvm::Module*))
        .function("getInt1Ty", &llvm::IRBuilder<llvm::TargetFolder>::getInt1Ty, allow_raw_pointers()) // try compilin
        // .function("getInt8Ty", &builder_getInt8Ty, allow_raw_pointers())
        // .function("getInt16Ty", &builder_getInt16Ty, allow_raw_pointers())
        // .function("getInt32Ty", &builder_getInt32Ty, allow_raw_pointers())
        // .function("getInt64Ty", &builder_getInt64Ty, allow_raw_pointers())
        // .function("getInt128Ty", &builder_getInt128Ty, allow_raw_pointers())
        // .function("getHalfTy", &builder_getHalfTy, allow_raw_pointers())
        // .function("getBFloatTy", &builder_getBFloatTy, allow_raw_pointers())
        // .function("getFloatTy", &builder_getFloatTy, allow_raw_pointers())
        // .function("getDoubleTy", &builder_getDoubleTy, allow_raw_pointers())
        // .function("getVoidTy", &builder_getVoidTy, allow_raw_pointers())
        .function("getIntN", &llvm::IRBuilder<llvm::TargetFolder>::getIntN, allow_raw_pointers())
        .function("getInt64", &llvm::IRBuilder<llvm::TargetFolder>::getInt64, allow_raw_pointers())
        .function("getInt32", &llvm::IRBuilder<llvm::TargetFolder>::getInt32, allow_raw_pointers())
        .function("getInt16", &llvm::IRBuilder<llvm::TargetFolder>::getInt16, allow_raw_pointers())
        .function("getInt8", &llvm::IRBuilder<llvm::TargetFolder>::getInt8, allow_raw_pointers())
        .function("getInt1", &llvm::IRBuilder<llvm::TargetFolder>::getInt1, allow_raw_pointers())
        .function("getTrue", &llvm::IRBuilder<llvm::TargetFolder>::getTrue, allow_raw_pointers())
        .function("getFalse", &llvm::IRBuilder<llvm::TargetFolder>::getFalse, allow_raw_pointers());

    
}
