#include "gc/common-object.h"
#include "gc/ugc/ugc.h"
#include <stdio.h>
#include <stdlib.h>

/**
 * This method will always be called from the whacko std lib, and is type safe.
 * The obj parameter will always be a string.
 */
void __whacko_console_log(whacko_object_t *obj) {
  void *ptr = (void *)&obj[1];
  fwrite(&ptr, obj->size - (size_t)sizeof(whacko_object_t), 1, stdout);
}
