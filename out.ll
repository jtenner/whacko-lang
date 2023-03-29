; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

@"tmp1~" = global [22 x i8] c"\01\00\00\00\00\00\00\00Hello operator"

define void @_start() #0 {
entry:
  %"tmp0~" = alloca i128, align 8
  store ptr @"tmp1~", ptr %"tmp0~", align 8
  %"tmp2~" = load ptr, ptr %"tmp0~", align 8
  call void @"std/str.wo~str.__set"(ptr %"tmp2~", i32 0, i8 1)
  ret void
}

define void @"std/str.wo~str.__set"(ptr %0, i32 %1, i8 %2) {
entry:
  ret void
}

attributes #0 = { "target-features"="+simd128" }
