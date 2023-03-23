; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define void @_start() #0 {
entry:
  %"tmp0~" = call i64 @"std/lunatic.wo~lunatic.process.create_config"()
  call void @"std/lunatic.wo~lunatic.process.drop_config"(i64 %"tmp0~")
  %"tmp3~" = call i16 @"std/wasi.wo~wasi.functions.environ_sizes_get"(i32 12, i32 34)
  ret void
}

declare i64 @"std/lunatic.wo~lunatic.process.create_config"() #1

declare void @"std/lunatic.wo~lunatic.process.drop_config"(i64) #2

declare i16 @"std/wasi.wo~wasi.functions.environ_sizes_get"(i32, i32) #3

attributes #0 = { "target-features"="+simd128" }
attributes #1 = { "wasm-import-module"="lunatic::process" "wasm-import-name"="create_config" }
attributes #2 = { "wasm-import-module"="lunatic::process" "wasm-import-name"="drop_config" }
attributes #3 = { "wasm-import-module"="wasi_snapshot_preview1" "wasm-import-name"="environ_sizes_get" }
