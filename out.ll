; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

@gotten = private unnamed_addr constant [7 x i8] c"gotten\00", align 1

define void @_start() #0 {
entry:
  %"tmp0~" = call i32 @"testFile.wo~id<usize>"(i32 11)
  %"tmp1~" = call ptr @"testFile.wo~gottenString"()
  %"tmp2~" = load i32, ptr %"tmp1~", align 4
  %"tmp3~" = call i32 @"testFile.wo~id<usize>"(i32 %"tmp2~")
  %"tmp4~" = call ptr @"testFile.wo~A.constructor"()
  %"tmp5~" = call i32 @"testFile.wo~id<usize>"(i32 4)
  %"tmp6~" = call i32 @"testFile.wo~id<usize>"(i32 11)
  ret void
}

define i32 @"testFile.wo~id<usize>"(i32 %0) {
entry:
  ret i32 %0
}

define ptr @"testFile.wo~gottenString"() {
entry:
  %malloccall = tail call ptr @malloc(i32 ptrtoint (ptr getelementptr ([14 x i8], ptr null, i32 1) to i32))
  %"tmp10~" = bitcast ptr %malloccall to ptr
  %"tmp11~" = getelementptr i8, ptr %"tmp10~", i32 0
  store i32 6, ptr %"tmp11~", align 4
  %"tmp12~" = getelementptr i8, ptr %"tmp10~", i32 8
  call void @llvm.memcpy.p0.p0.i32(ptr align 1 %"tmp12~", ptr align 1 @gotten, i32 14, i1 false)
  ret ptr %"tmp10~"
}

define ptr @"testFile.wo~A.constructor"() {
entry:
  %malloccall = tail call ptr @malloc(i32 ptrtoint (ptr getelementptr ([12 x i8], ptr null, i32 1) to i32))
  %"tmp7~" = bitcast ptr %malloccall to ptr
  store i32 4, ptr %"tmp7~", align 4
  %"tmp8~" = getelementptr i8, ptr %"tmp7~", i32 4
  store i32 1, ptr %"tmp8~", align 4
  %"tmp9~" = getelementptr i8, ptr %"tmp7~", i32 8
  store i32 14, ptr %"tmp9~", align 4
  ret ptr %"tmp7~"
}

declare noalias ptr @malloc(i32)

; Function Attrs: nocallback nofree nounwind willreturn memory(argmem: readwrite)
declare void @llvm.memcpy.p0.p0.i32(ptr noalias nocapture writeonly, ptr noalias nocapture readonly, i32, i1 immarg) #1

attributes #0 = { "target-features"="+simd128" }
attributes #1 = { nocallback nofree nounwind willreturn memory(argmem: readwrite) }
