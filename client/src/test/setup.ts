import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Sans `globals: true`, Testing Library ne démonte pas les rendus tout seul entre deux tests.
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});
