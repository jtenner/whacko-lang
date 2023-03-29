; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define void @_start() #0 {
entry:
  %"tmp0~" = alloca i128, align 8
  %"tmp1~" = call ptr @"testFile.wo~A.constructor"()
  store ptr %"tmp1~", ptr %"tmp0~", align 8
  %"tmp2~" = load ptr, ptr %"tmp0~", align 8
  call void @"testFile.wo~A.method"(ptr %"tmp2~")
  ret void
}

define ptr @"testFile.wo~A.constructor"() {
entry:
  %malloccall = tail call ptr @malloc(i32 ptrtoint (ptr getelementptr ([8 x i8], ptr null, i32 1) to i32))
  %"tmp5~" = bitcast ptr %malloccall to ptr
  store i32 0, ptr %"tmp5~", align 4
  %"tmp6~" = getelementptr i8, ptr %"tmp5~", i32 4
  store i32 1, ptr %"tmp6~", align 4
  ret ptr %"tmp5~"
}

define void @"testFile.wo~A.method"(ptr %0) {
entry:
  %"tmp4~" = alloca i128, align 8
  store i32 1, ptr %"tmp4~", align 4
  ret void
}

declare noalias ptr @malloc(i32)

attributes #0 = { "target-features"="+simd128" }
