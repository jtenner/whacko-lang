clear

cd std/gc

# get wasi-sysroot
[ ! -f wasi-sysroot-20.0.tar.gz ] && wget https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-20/wasi-sysroot-20.0.tar.gz
tar -xvf wasi-sysroot-20.0.tar.gz
cd ../..

# llvm and clang 16
[ ! -f llvm.sh ] wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
sudo ./llvm.sh 16

clang-16 \
  --target=wasm32-wasi \
  ./std/gc/gc.c \
  -Ofast \
  -flto \
  -o ./std/link/whacko-std.o \
  --sysroot=./std/gc/wasi-sysroot \
  -c

npm install
