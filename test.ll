; ModuleID = 'whacko'
source_filename = "whacko"
target triple = "wasm32-wasi"

define void @"testFile.wo~doSomething"(i32 %0) #0 {
entry:
  ret void
}

define void @_start() #0 {
entry:
  call void @"testFile.wo~doSomething"(i32 0)
  ret void
}

attributes #0 = { "target-features"="+simd128" }
