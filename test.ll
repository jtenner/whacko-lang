; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define i32 @"testFile.wo~someVal"() #0 {
entry:
  ret i32 42
}

define void @_start() #0 {
entry:
  %"tmp0~" = call ptr @"testFile.wo~A.constructor"()
  %"tmp1~" = call ptr @"testFile.wo~A.constructor"()
  %"tmp2~" = call i32 @"testFile.wo~someVal"()
  %"tmp3~" = add i32 %"tmp2~", 0
  %"tmp4~" = getelementptr ptr, ptr %"tmp1~", i32 8
  store i32 %"tmp3~", ptr %"tmp4~", align 4
  ret void
}

define ptr @"testFile.wo~A.constructor"() {
entry:
  %0 = bitcast i32 12 to i32
  %mallocsize = mul i32 %0, ptrtoint (ptr getelementptr (ptr, ptr null, i32 1) to i32)
  %malloccall = tail call ptr @malloc(i32 %mallocsize)
  %"tmp5~" = bitcast ptr %malloccall to ptr
  store i32 12, ptr %"tmp5~", align 4
  %"tmp6~" = getelementptr ptr, ptr %"tmp5~", i32 4
  store i32 1, ptr %"tmp6~", align 4
  %"tmp7~" = getelementptr ptr, ptr %"tmp5~", i32 8
  store i32 42, ptr %"tmp7~", align 4
  ret ptr %"tmp5~"
}

declare noalias ptr @malloc(i32)

attributes #0 = { "target-features"="+simd128" }
