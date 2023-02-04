#!/bin/sh

set -e

emcmake cmake \
    -Wno-dev \
    -DLLVM_TARGETS_TO_BUILD=WebAssembly \
    -DCMAKE_CXX_FLAGS="-sERROR_ON_UNDEFINED_SYMBOLS=0 -Wno-unused-command-line-argument" \
    -DCMAKE_BUILD_TYPE=Debug \
    -GNinja \
    -S llvm-project/llvm \
    -B build-emscripten

ninja -C build-emscripten

# em++ \
#     src/bindings.cpp \
#     -I  \
#     -lembind \
#     -o build/bindings.mjs \
#     -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
#     -O2 \
#     -sWASM_BIGINT
