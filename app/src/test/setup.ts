import { configure } from "@testing-library/dom";

// The workspace mounts React Flow; its first paint can outlast the 1s default
// on a busy machine. A slow render is not a wrong one.
configure({ asyncUtilTimeout: 5000 });
