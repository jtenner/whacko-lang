#!/bin/bash

set -e

: emcmake cmake \
    -Wno-dev \
    -DLLVM_TARGETS_TO_BUILD=WebAssembly \
    -DLLVM_BUILD_TOOLS=OFF \
    -DLLVM_ENABLE_PROJECTS="lld;clang" \
    -DCLANG_BUILD_TOOLS=OFF \
    -DCMAKE_CXX_FLAGS="-sERROR_ON_UNDEFINED_SYMBOLS=0 -Wno-unused-command-line-argument" \
    -DCMAKE_BUILD_TYPE=Release \
    -GNinja \
    -S llvm-project/llvm \
    -B build-emscripten

: ninja -C build-emscripten

: em++ \
    src/bindings.cpp build-emscripten/lib/libLLVM*.a \
    -I llvm-project/llvm/include -I build-emscripten/include \
    -lembind \
    -o src/bindings.mjs \
    -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
    -O2

em++ \
    src/bindings-generator.cpp build-emscripten/lib/lib{LLVM*,clang*}.a \
    -I llvm-project/llvm/include -I llvm-project/clang/include -I build-emscripten/include -I build-emscripten/tools/clang/include \
    -lembind \
    -o src/bindings-generator.mjs \
    -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
    -O0 \
    -fno-rtti