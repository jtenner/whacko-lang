; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

@"Hello world!" = private unnamed_addr constant [13 x i8] c"Hello world!\00", align 1

define void @_start() #0 {
entry:
  %0 = bitcast i32 20 to i32
  %mallocsize = mul i32 %0, ptrtoint (ptr getelementptr (i32, ptr null, i32 1) to i32)
  %malloccall = tail call ptr @malloc(i32 %mallocsize)
  %"tmp0~" = bitcast ptr %malloccall to ptr
  %"tmp1~" = getelementptr ptr, ptr %"tmp0~", i32 8
  call void @llvm.memcpy.p0.p0.i32(ptr align 1 %"tmp1~", ptr align 1 @"Hello world!", i32 20, i1 false)
  call void @"std/console.wo~console.log"(ptr %"tmp0~")
  ret void
}

define void @"std/console.wo~console.log"(ptr %0) {
entry:
  %"tmp3~" = alloca ptr, i32 8, align 8
  %"tmp4~" = ptrtoint ptr %"tmp3~" to i32
  %"tmp5~" = ptrtoint ptr %0 to i32
  %"tmp6~" = add i32 %"tmp5~", 8
  %"tmp7~" = inttoptr i32 %"tmp4~" to ptr
  store i32 %"tmp6~", ptr %"tmp7~", align 4
  %"tmp8~" = add i32 %"tmp4~", 4
  %"tmp9~" = ptrtoint ptr %0 to i32
  %"tmp10~" = inttoptr i32 %"tmp8~" to ptr
  store i32 %"tmp9~", ptr %"tmp10~", align 4
  %"tmp11~" = alloca ptr, i32 4, align 8
  %"tmp12~" = ptrtoint ptr %"tmp11~" to i32
  %"tmp13~" = call i16 @"std/wasi.wo~wasi.functions.fd_write"(i32 1, i32 %"tmp4~", i32 1, i32 %"tmp12~")
  ret void
}

declare noalias ptr @malloc(i32)

; Function Attrs: nocallback nofree nounwind willreturn memory(argmem: readwrite)
declare void @llvm.memcpy.p0.p0.i32(ptr noalias nocapture writeonly, ptr noalias nocapture readonly, i32, i1 immarg) #1

declare i16 @"std/wasi.wo~wasi.functions.fd_write"(i32, i32, i32, i32) #2

attributes #0 = { "target-features"="+simd128" }
attributes #1 = { nocallback nofree nounwind willreturn memory(argmem: readwrite) }
attributes #2 = { "wasm-import-module"="wasi_snapshot_preview1" "wasm-import-name"="fd_write" }
