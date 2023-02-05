import init from "./bindings.mjs"

const llvm = await init()
await llvm.ready

export default llvm