/**
 * finalization_registry.ts
 * ------------------------
 *
 * Small helper around `FinalizationRegistry` for wasm-backed JS wrappers.
 * It provides a fallback cleanup path when `free()` is not called explicitly.
 */

interface FinalizationRegistryLike {
  register(target: object, heldValue: number, unregisterToken?: object): void;
  unregister(unregisterToken: object): void;
}

interface FinalizationRegistryConstructorLike {
  new (cleanup: (heldValue: number) => void): FinalizationRegistryLike;
}

const FinalizationRegistryCtor = (
  globalThis as { FinalizationRegistry?: FinalizationRegistryConstructorLike }
).FinalizationRegistry;

/**
 * Helper around `FinalizationRegistry` for JS wrappers that own a wasm pointer.
 * It provides a fallback cleanup path when `free()` is not called explicitly.
 *
 * /!\ WARNING /!\: It should not be relied on for memory management, as the
 * JS mechanisms it relies on might not be always available on the current
 * platform. Use only this as a resilience mechanism alongside real
 * memory-freeing code.
 */
export class Finalizer {
  private readonly cleanup: (ptr: number) => void;
  private registry?: FinalizationRegistryLike;

  /**
   * Stores the native cleanup callback used for registered pointers.
   * @param cleanup - Function to call on free.
   *
   */
  constructor(cleanup: (ptr: number) => void) {
    this.cleanup = cleanup;
  }

  /**
   * Registers a JS wrapper and the native pointer that should be freed with it.
   * @param target - JS object that should be tracked for memory garbage
   * collection.
   * @param ptr - Pointer value that should be passed to the `cleanup` function
   * passed to constructor when `target` is GCed.
   */
  public register(target: object, ptr: number): void {
    if (FinalizationRegistryCtor === undefined) {
      return;
    }
    this.registry ??= new FinalizationRegistryCtor((heldValue: number) =>
      this.cleanup(heldValue),
    );
    this.registry.register(target, ptr, target);
  }

  /**
   * Cancels automatic cleanup once the pointer has been freed manually.
   * @param target - Object that has been cleaned up manually already.
   */
  public unregister(target: object): void {
    this.registry?.unregister(target);
  }
}
