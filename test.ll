; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define void @_start() #0 {
entry:
  %"tmp0~" = call ptr @"testFile.wo~A<i32>.constructor"(i32 1)
  ret void
}

define ptr @"testFile.wo~A<i32>.constructor"(i32 %0) {
entry:
  %1 = bitcast i32 16 to i32
  %mallocsize = mul i32 %1, ptrtoint (ptr getelementptr (ptr, ptr null, i32 1) to i32)
  %malloccall = tail call ptr @malloc(i32 %mallocsize)
  %"tmp1~" = bitcast ptr %malloccall to ptr
  store i32 16, ptr %"tmp1~", align 4
  %"tmp2~" = getelementptr ptr, ptr %"tmp1~", i32 4
  store i32 1, ptr %"tmp2~", align 4
  %"tmp3~" = getelementptr ptr, ptr %"tmp1~", i32 8
  store i32 42, ptr %"tmp3~", align 4
  %"tmp4~" = getelementptr ptr, ptr %"tmp1~", i32 12
  store i32 0, ptr %"tmp4~", align 4
  %"tmp5~" = getelementptr ptr, ptr %"tmp1~", i32 12
  store i32 %0, ptr %"tmp5~", align 4
  ret ptr %"tmp1~"
}

declare noalias ptr @malloc(i32)

attributes #0 = { "target-features"="+simd128" }
