interface FinalizationRegistryLike {
  register(target: object, heldValue: number, unregisterToken?: object): void;
  unregister(unregisterToken: object): void;
}

interface FinalizationRegistryConstructorLike {
  new (cleanup: (heldValue: number) => void): FinalizationRegistryLike;
}

export interface FinalizerState {
  cleanup(ptr: number): void;
  registry?: FinalizationRegistryLike;
}

const FinalizationRegistryCtor = (
  globalThis as { FinalizationRegistry?: FinalizationRegistryConstructorLike }
).FinalizationRegistry;

export function registerFinalizer(
  target: object,
  ptr: number,
  finalizer: FinalizerState,
): void {
  if (FinalizationRegistryCtor === undefined) {
    return;
  }
  finalizer.registry ??= new FinalizationRegistryCtor((heldValue: number) =>
    finalizer.cleanup(heldValue),
  );
  finalizer.registry.register(target, ptr, target);
}

export function unregisterFinalizer(
  target: object,
  finalizer: FinalizerState,
): void {
  finalizer.registry?.unregister(target);
}
