; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define void @_start() #0 {
entry:
  %"tmp0~" = call ptr @"testFile.wo~A.constructor"()
  ret void
}

define ptr @"testFile.wo~A.constructor"() {
entry:
  %malloccall = tail call ptr @malloc(i32 ptrtoint (ptr getelementptr ([12 x i8], ptr null, i32 1) to i32))
  %"tmp1~" = bitcast ptr %malloccall to ptr
  store i32 4, ptr %"tmp1~", align 4
  %"tmp2~" = getelementptr i8, ptr %"tmp1~", i32 4
  store i32 1, ptr %"tmp2~", align 4
  %"tmp3~" = getelementptr i8, ptr %"tmp1~", i32 8
  store i32 14, ptr %"tmp3~", align 4
  ret ptr %"tmp1~"
}

declare noalias ptr @malloc(i32)

attributes #0 = { "target-features"="+simd128" }
