; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define void @_start() #0 {
entry:
  ret void
}

attributes #0 = { "target-features"="+simd128" }
