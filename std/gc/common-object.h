#include "ugc/ugc.h"

#ifndef WHACKO_COMMON_OBJECT
#define WHACKO_COMMON_OBJECT
typedef struct {
  ugc_header_t header;
  // Whacko only looks at the following fields:
  uint32_t type;
  size_t size;
} whacko_object_t;

typedef struct {
  // Number of roots in the stack frame.
  int32_t num_roots;
  // We do not use metadata.
  int32_t unused_num_meta;
  const void *unused_meta[0];
} llvm_frame_map_t;
#endif