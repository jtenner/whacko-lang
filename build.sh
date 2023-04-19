clear

cd std/gc

# get wasi-sysroot
[ ! -f wasi-sysroot-20.0.tar.gz ] && wget https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-20/wasi-sysroot-20.0.tar.gz
tar -xvf wasi-sysroot-20.0.tar.gz
cd ../..

# llvm and clang 16
[ ! -f ./llvm.sh ] && wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
sudo ./llvm.sh 16

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

npm install

npm run langium:generate
npm run tsc

node --enable-source-maps test/compiler.mjs

wasm-ld-16 ./std/link/*.o \
  ./std/gc/wasi-sysroot/lib/wasm32-wasi/*.a \
  ./test/programs/String.o.snap \
  -o test.wasm
  # ./std/gc/wasi-sysroot/lib/wasm32-wasi/*.o \
