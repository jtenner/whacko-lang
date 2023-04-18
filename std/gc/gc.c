#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

#define UGC_DECL static
#define UGC_IMPLEMENTATION
#include "ugc/ugc.h"

// The following originates from AssemblyScript (std/assembly/rt/itcms.ts):
//   1. The WGC_GRANULARITY/WGC_STEPFACTOR/WGC_IDLEFACTOR constants and their
//      explanations.
//   2. The threshold variable and initial value.
//   3. The interrupt function.

static ugc_t ugc_instance;
static size_t total = 0;

typedef struct
{
  ugc_header_t header;
  // Whacko only looks at the following fields:
  uint32_t type;
  size_t size;
} whacko_object_t;

static void wgc_interrupt()
{
  // This algorithm is arbitrary and should be rewritten later.
  int number = total / 1024;
  for (int i = 0; i < number; i++)
    ugc_step(&ugc_instance);
}

whacko_object_t *__whacko_gc_alloc(uint32_t type, size_t size)
{
  wgc_interrupt();

  whacko_object_t *ptr = malloc(size);
  ptr->type = type;
  ptr->size = size;

  total += size;
  ugc_register(&ugc_instance, (ugc_header_t *)ptr);
  return ptr;
}

void __whacko_gc_collect()
{
  ugc_collect(&ugc_instance);
}

// TODO: Use @llvm.gcwrite(i8* %value, i8* %object, i8** %derived) instead
//       with a custom LLVM pass.
void __whacko_gc_store_field_ptr(enum ugc_barrier_direction_e barrier_direction, void *parent, void *child, void **field_location)
{
  *field_location = child;
  ugc_write_barrier(&ugc_instance, barrier_direction, parent, child);
}

typedef struct
{
  // Number of roots in the stack frame.
  int32_t num_roots;
  // We do not use metadata.
  int32_t unused_num_meta;
  const void *unused_meta[0];
} llvm_frame_map_t;

typedef struct _llvm_stack_entry_t
{
  // Next (caller) stack entry.
  struct _llvm_stack_entry_t *next;
  // Pointer to this entry's frame map.
  const llvm_frame_map_t *map;
  // Pointer to roots array.
  void *roots[0];
} llvm_stack_entry_t;

// This is provided by LLVM itself.
extern llvm_stack_entry_t *llvm_gc_root_chain;

void __whacko_gc_visit(size_t ptr_value)
{
  ugc_header_t *ptr = (ugc_header_t *)ptr_value;
  if (ptr)
    ugc_visit(&ugc_instance, ptr);
}

extern void __visit_whacko_object(whacko_object_t *ptr);

static void wgc_scan(ugc_t *gc, ugc_header_t *ptr)
{
  if (!ptr)
  {
    // Scan the roots.
    llvm_stack_entry_t *entry = llvm_gc_root_chain;
    while (entry)
    {
      for (int i = 0; i < entry->map->num_roots; i++)
        ugc_visit(gc, entry->roots[i]);

      entry = entry->next;
    }
    return;
  }

  // Visit an object.
  __visit_whacko_object((whacko_object_t *)ptr);
}

static void wgc_release(ugc_t *gc, ugc_header_t *ptr)
{
  (void)gc;

  total -= ((whacko_object_t *)ptr)->size;
  free(ptr);
}

void __whacko_gc_initialize()
{
  ugc_init(&ugc_instance, wgc_scan, wgc_release);
}