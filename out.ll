; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define void @_start() #0 {
entry:
  %"tmp0~" = alloca i128, align 8
  %malloccall = tail call ptr @malloc(i32 ptrtoint (ptr getelementptr ([12 x i8], ptr null, i32 1) to i32))
  %"tmp1~" = bitcast ptr %malloccall to ptr
  %"tmp2~" = call ptr @"testFile.wo~A.constructor"(ptr %"tmp1~")
  store ptr %"tmp1~", ptr %"tmp0~", align 8
  ret void
}

define ptr @"testFile.wo~A.constructor"(ptr %0) {
entry:
  store i32 4, ptr %0, align 4
  %"tmp3~" = getelementptr i8, ptr %0, i32 4
  store i32 2, ptr %"tmp3~", align 4
  %"tmp4~" = getelementptr i8, ptr %0, i32 8
  store i32 99, ptr %"tmp4~", align 4
  %1 = call ptr @"testFile.wo~B<i32>.constructor"(ptr %0)
  ret ptr %0
}

declare noalias ptr @malloc(i32)

define ptr @"testFile.wo~B<i32>.constructor"(ptr %0) {
entry:
  store i32 4, ptr %0, align 4
  %"tmp5~" = getelementptr i8, ptr %0, i32 4
  store i32 1, ptr %"tmp5~", align 4
  %"tmp6~" = getelementptr i8, ptr %0, i32 8
  store i32 99, ptr %"tmp6~", align 4
  ret ptr %0
}

attributes #0 = { "target-features"="+simd128" }
