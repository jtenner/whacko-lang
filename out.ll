; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define i1 @"testFile.wo~getBool"() #0 {
entry:
  ret i1 true
}

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
  %"tmp3~" = alloca i128, align 8
  store i32 4, ptr %0, align 4
  %"tmp4~" = getelementptr i8, ptr %0, i32 4
  store i32 1, ptr %"tmp4~", align 4
  %"tmp5~" = getelementptr i8, ptr %0, i32 8
  %"tmp6~" = call i1 @"testFile.wo~getBool"()
  br i1 %"tmp6~", label %"tmp8~", label %"tmp9~"

"tmp8~":                                          ; preds = %entry
  store i32 1, ptr %"tmp3~", align 4
  br label %"tmp10~"

"tmp9~":                                          ; preds = %entry
  store i32 2, ptr %"tmp3~", align 4
  br label %"tmp10~"

"tmp10~":                                         ; preds = %"tmp9~", %"tmp8~"
  %"tmp7~" = load i32, ptr %"tmp3~", align 4
  store i32 %"tmp7~", ptr %"tmp5~", align 4
  ret ptr %0
}

declare noalias ptr @malloc(i32)

attributes #0 = { "target-features"="+simd128" }
