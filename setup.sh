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

mkdir std/link
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