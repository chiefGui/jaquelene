import * as stylex from "@stylexjs/stylex";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type SecondarySidebarHostContextValue = {
  element: HTMLDivElement | null;
  setElement: Dispatch<SetStateAction<HTMLDivElement | null>>;
};

const SecondarySidebarHostContext = createContext<SecondarySidebarHostContextValue | null>(null);

function useSecondarySidebarHost() {
  const context = useContext(SecondarySidebarHostContext);

  if (!context) {
    throw new Error("SecondarySidebar must be rendered inside SecondarySidebarHostProvider.");
  }

  return context;
}

export function useSecondarySidebarHostElement() {
  return useSecondarySidebarHost().element;
}

export function SecondarySidebarHostProvider({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const context = useMemo(() => ({ element, setElement }), [element]);

  return (
    <SecondarySidebarHostContext.Provider value={context}>
      {children}
    </SecondarySidebarHostContext.Provider>
  );
}

export function SecondarySidebarHost() {
  const { setElement } = useSecondarySidebarHost();
  return <div ref={setElement} {...stylex.props(styles.host)} />;
}

const styles = stylex.create({
  host: {
    display: "contents",
  },
});
