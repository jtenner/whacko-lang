; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

@"tmp0~" = global [13 x i8] c"\01\00\00\00\00\00\00\00test!"

define void @_start() #0 {
entry:
  %"tmp1~" = call i8 @"std/str.wo~str.__get"(ptr @"tmp0~", i32 0)
  ret void
}

define i8 @"std/str.wo~str.__get"(ptr %0, i32 %1) {
entry:
  %"tmp2~" = ptrtoint ptr %0 to i32
  %"tmp3~" = add i32 %"tmp2~", 8
  %"tmp4~" = add i32 %"tmp3~", %1
  %"tmp5~" = inttoptr i32 %"tmp4~" to ptr
  %"tmp6~" = load i8, ptr %"tmp5~", align 1
  ret i8 %"tmp6~"
}

attributes #0 = { "target-features"="+simd128" }
