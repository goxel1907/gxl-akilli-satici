import { DatabaseSync } from "node:sqlite";
import { CRM_OBJECT_NAME, CrmStore, type CrmNamespace, type CrmSql, type CrmState } from "../../../worker/src/crm-store.js";

export function crmFixture(path = ":memory:") {
  const database = new DatabaseSync(path);
  let failWrites = false,failOwnerWrites=false;
  const sql: CrmSql = { exec<T>(query: string, ...values: Array<string | number | null>) {
    if(failOwnerWrites&&/^(INSERT INTO|UPDATE) owner_/.test(query))throw Error("Simulated notification storage failure");
    if (failWrites && query.startsWith("INSERT INTO crm_leads")) throw Error("Simulated disk failure");
    const rows = database.prepare(query).all(...values) as T[];
    return { toArray: () => rows };
  } };
  const ctx: CrmState = { storage: { sql, transactionSync<T>(callback: () => T): T {
    database.exec("BEGIN IMMEDIATE");
    try { const result = callback(); database.exec("COMMIT"); return result; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  } } };
  const object = new CrmStore(ctx);
  const namespace: CrmNamespace = { idFromName: name => name, get: id => {
    if (id !== CRM_OBJECT_NAME) throw Error("Unexpected CRM identity");
    return { fetch: request => object.fetch(request) };
  } };
  return { sql, namespace, close: () => database.close(), failWrites: (fail: boolean) => { failWrites = fail; },failOwnerWrites:(fail:boolean)=>{failOwnerWrites=fail;} };
}
