; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define void @_start() #0 {
entry:
  %"tmp0~" = call i64 @"testFile.wo~getTernary"()
  ret void
}

define i64 @"testFile.wo~getTernary"() {
entry:
  %"tmp1~" = call i1 @"testFile.wo~getBool"()
  %"tmp6~" = alloca i128, align 8
  br i1 %"tmp1~", label %"tmp3~", label %"tmp4~"

"tmp3~":                                          ; preds = %entry
  store i64 1, ptr %"tmp6~", align 4
  br label %"tmp5~"

"tmp4~":                                          ; preds = %entry
  store i64 2, ptr %"tmp6~", align 4
  br label %"tmp5~"

"tmp5~":                                          ; preds = %"tmp4~", %"tmp3~"
  %"tmp2~" = load i64, ptr %"tmp6~", align 4
  ret i64 %"tmp2~"
}

define i1 @"testFile.wo~getBool"() {
entry:
  ret i1 true
}

attributes #0 = { "target-features"="+simd128" }
