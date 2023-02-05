import init from "./bindings-generator.mjs"

const generator = await init()
await generator.ready

console.log(generator)