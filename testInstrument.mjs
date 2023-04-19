import fs from "node:fs";
import wasi from "node:wasi";
const wasiInstance = new wasi.WASI();

const binary = fs.readFileSync("./test.wasm");
const inst = await WebAssembly.instantiate(binary, { wasi_snapshot_preview1: wasiInstance.wasiImport } );
console.log(inst);
wasiInstance.start(inst.instance);
