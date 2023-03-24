clear
node --enable-source-maps bin/cli testFile.wo 2> error.txt
llc-16 test.bc --march=wasm32 -o test.o -filetype=obj --experimental-debug-variable-locations --emit-call-site-info
wasm-ld-16 test.o -o test.wasm ../wasi-sysroot/lib/wasm32-wasi/libc.a ../wasi-sysroot/lib/wasm32-wasi/libm.a