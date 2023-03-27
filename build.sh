clear
node --enable-source-maps bin/cli testFile.wo --outBC out.bc --outLL out.ll --outO out.o 
## opt-16 -O3 test.bc -o test.bc 
## llc-16 test.bc --march=wasm32 -o test.o -filetype=obj --experimental-debug-variable-locations --emit-call-site-info --polly -O3

## UNCOMMENT THE FOLLOWING LINE IF YOU HAVE LLVM INSTALLED:
wasm-ld-16 out.o -o test.wasm ../wasi-sysroot/lib/wasm32-wasi/libc.a ../wasi-sysroot/lib/wasm32-wasi/libm.a -O3