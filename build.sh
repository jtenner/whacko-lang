# npm run langium:generate
# npm run tsc

cd std/link

clang-16 \
  --target=wasm32-wasi \
  ../string/*.c \
  ../gc/*.c \
  ../*.c \
  -Ofast \
  -flto \
  --sysroot=../gc/wasi-sysroot \
  -c

cd ../..

node --enable-source-maps test/compiler.mjs

wasm-ld-16 ./std/link/*.o \
  ./std/gc/wasi-sysroot/lib/wasm32-wasi/*.a \
  ./test/programs/String.o.snap \
  -o test.wasm
  # ./std/gc/wasi-sysroot/lib/wasm32-wasi/*.o \
