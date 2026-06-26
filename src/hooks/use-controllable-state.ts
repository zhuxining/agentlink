import { useCallback, useState } from "react";

interface UseControllableStateParams<T> {
  defaultProp: T;
  onChange?: (state: T) => void;
  prop?: T | undefined;
}

export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: UseControllableStateParams<T>): [T, (value: T) => void] {
  const [internalState, setInternalState] = useState<T>(defaultProp);
  const isControlled = prop !== undefined;
  const state = isControlled ? prop : internalState;

  const setState = useCallback(
    (value: T) => {
      if (!isControlled) {
        setInternalState(value);
      }
      onChange?.(value);
    },
    [isControlled, onChange]
  );

  return [state, setState];
}
