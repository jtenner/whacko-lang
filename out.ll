; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define void @_start() #0 {
entry:
  %"tmp0~" = call double @acos(double 1.000000e+00)
  ret void
}

declare double @acos(double)

attributes #0 = { "target-features"="+simd128" }
