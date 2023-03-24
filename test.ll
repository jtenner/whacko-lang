; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

@"Hello world!" = private unnamed_addr constant [13 x i8] c"Hello world!\00", align 1

define void @_start() #0 {
entry:
  %malloccall = tail call ptr @malloc(i32 ptrtoint (ptr getelementptr ([20 x i8], ptr null, i32 1) to i32))
  %"tmp0~" = bitcast ptr %malloccall to ptr
  %"tmp1~" = getelementptr i8, ptr %"tmp0~", i32 0
  store i32 12, ptr %"tmp1~", align 4
  %"tmp2~" = getelementptr i8, ptr %"tmp0~", i32 8
  call void @llvm.memcpy.p0.p0.i32(ptr align 1 %"tmp2~", ptr align 1 @"Hello world!", i32 20, i1 false)
  call void @"std/console.wo~console.log"(ptr %"tmp0~")
  ret void
}

define void @"std/console.wo~console.log"(ptr %0) {
entry:
  %"tmp4~" = alloca ptr, i32 8, align 8
  %"tmp5~" = ptrtoint ptr %"tmp4~" to i32
  %"tmp6~" = ptrtoint ptr %0 to i32
  %"tmp7~" = add i32 %"tmp6~", 8
  %"tmp8~" = inttoptr i32 %"tmp5~" to ptr
  store i32 %"tmp7~", ptr %"tmp8~", align 4
  %"tmp9~" = add i32 %"tmp5~", 4
  %"tmp10~" = ptrtoint ptr %0 to i32
  %"tmp11~" = inttoptr i32 %"tmp10~" to ptr
  %"tmp12~" = load i32, ptr %"tmp11~", align 4
  %"tmp13~" = inttoptr i32 %"tmp9~" to ptr
  store i32 %"tmp12~", ptr %"tmp13~", align 4
  %"tmp14~" = alloca ptr, i32 4, align 8
  %"tmp15~" = ptrtoint ptr %"tmp14~" to i32
  %"tmp16~" = call i16 @"std/wasi.wo~wasi.functions.fd_write"(i32 1, i32 %"tmp5~", i32 1, i32 %"tmp15~")
  ret void
}

declare noalias ptr @malloc(i32)

; Function Attrs: nocallback nofree nounwind willreturn memory(argmem: readwrite)
declare void @llvm.memcpy.p0.p0.i32(ptr noalias nocapture writeonly, ptr noalias nocapture readonly, i32, i1 immarg) #1

declare i16 @"std/wasi.wo~wasi.functions.fd_write"(i32, i32, i32, i32) #2

attributes #0 = { "target-features"="+simd128" }
attributes #1 = { nocallback nofree nounwind willreturn memory(argmem: readwrite) }
attributes #2 = { "wasm-import-module"="wasi_snapshot_preview1" "wasm-import-name"="fd_write" }
