import { Skills } from "@jaquelene/ipc/renderer";
import { requireIpcMethod } from "@/ipc";

export const skillIpc = {
  listKinds: requireIpcMethod(Skills?.listKinds),
  list: requireIpcMethod(Skills?.list),
  get: requireIpcMethod(Skills?.get),
  create: requireIpcMethod(Skills?.create),
  update: requireIpcMethod(Skills?.update),
  delete: requireIpcMethod(Skills?.delete),
  getDefault: requireIpcMethod(Skills?.getDefault),
  setDefault: requireIpcMethod(Skills?.setDefault),
};
