import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

import { setLang } from "../i18n";

// jsdom annonce un navigateur anglais : les tests tournent en français, la langue de référence.
setLang("fr");
beforeEach(() => {
  setLang("fr");
});

// Sans `globals: true`, Testing Library ne démonte pas les rendus tout seul entre deux tests.
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});
