; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define void @_start() #0 {
entry:
  %"tmp0~" = alloca i128, align 8
  %"tmp1~" = alloca i128, align 8
  %"tmp2~" = call ptr @"testFile.wo~A.constructor"()
  store ptr %"tmp2~", ptr %"tmp1~", align 8
  ret void
}

define ptr @"testFile.wo~A.constructor"() {
entry:
  %malloccall = tail call ptr @malloc(i32 ptrtoint (ptr getelementptr ([8 x i8], ptr null, i32 1) to i32))
  %"tmp3~" = bitcast ptr %malloccall to ptr
  store i32 0, ptr %"tmp3~", align 4
  %"tmp4~" = getelementptr i8, ptr %"tmp3~", i32 4
  store i32 1, ptr %"tmp4~", align 4
  ret ptr %"tmp3~"
}

declare noalias ptr @malloc(i32)

attributes #0 = { "target-features"="+simd128" }
