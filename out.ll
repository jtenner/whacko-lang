; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define void @_start() #0 {
entry:
  %"tmp0~" = call i32 @"testFile.wo~perform"(i32 1, i32 2, ptr @"testFile.wo~add")
  %"tmp1~" = call i32 @"testFile.wo~perform"(i32 43, i32 1, ptr @"testFile.wo~sub")
  ret void
}

define i32 @"testFile.wo~add"(i32 %0, i32 %1) #0 {
entry:
  %"tmp4~" = add i32 %0, %1
  ret i32 %"tmp4~"
}

define i32 @"testFile.wo~perform"(i32 %0, i32 %1, ptr %2) {
entry:
  %"tmp3~" = call i32 %2(i32 %0, i32 %1)
  ret i32 %"tmp3~"
}

define i32 @"testFile.wo~sub"(i32 %0, i32 %1) #0 {
entry:
  %"tmp2~" = sub i32 %0, %1
  ret i32 %"tmp2~"
}

attributes #0 = { "target-features"="+simd128" }
