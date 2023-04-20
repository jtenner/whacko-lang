# npm run langium:generate
# npm run tsc

node --enable-source-maps test/compiler.mjs &&
  wasm-ld-16 ./std/link/*.o \
    ./std/gc/wasi-sysroot/lib/wasm32-wasi/*.a \
    ./test/programs/field-access.o.snap \
    -o test.wasm
  # ./std/gc/wasi-sysroot/lib/wasm32-wasi/*.o \
