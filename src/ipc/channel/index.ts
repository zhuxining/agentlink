import {
  disableAdapter,
  enableAdapter,
  listAdapters,
  listEnabledAdapters,
} from "./handlers";

export const channel = {
  listAdapters,
  listEnabledAdapters,
  enableAdapter,
  disableAdapter,
};
