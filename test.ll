; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define void @_start() #0 {
entry:
  %"tmp0~" = call ptr @"testFile.wo~A.constructor"()
  call void @"testFile.wo~A.doStuff<i32>"(ptr %"tmp0~", i32 1234)
  ret void
}

define ptr @"testFile.wo~A.constructor"() {
entry:
  %0 = bitcast i32 12 to i32
  %mallocsize = mul i32 %0, ptrtoint (ptr getelementptr (ptr, ptr null, i32 1) to i32)
  %malloccall = tail call ptr @malloc(i32 %mallocsize)
  %"tmp3~" = bitcast ptr %malloccall to ptr
  store i32 12, ptr %"tmp3~", align 4
  %"tmp4~" = getelementptr ptr, ptr %"tmp3~", i32 4
  store i32 1, ptr %"tmp4~", align 4
  %"tmp5~" = getelementptr ptr, ptr %"tmp3~", i32 8
  store i32 42, ptr %"tmp5~", align 4
  ret ptr %"tmp3~"
}

define void @"testFile.wo~A.doStuff<i32>"(ptr %0, i32 %1) {
entry:
  %"tmp2~" = add i32 %1, %1
  ret void
}

declare noalias ptr @malloc(i32)

attributes #0 = { "target-features"="+simd128" }
