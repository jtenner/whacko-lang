import llvm from "./bindings-loader.mjs"

const context = new llvm.LLVMContext()
const module = new llvm.Module("whacko", context)
const builder = new llvm.IRBuilder(context, module)

console.log(builder)