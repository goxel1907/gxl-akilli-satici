import assert from "node:assert/strict";
import test from "node:test";
import { byNaturalName, entryName, folderSupported } from "../../mobile/gxl-folder.js";

test("GXL folder entries are named and ordered like the seller sees them", () => {
  assert.equal(entryName("content://com.android.externalstorage.documents/tree/primary%3ADownload%2FGXL/document/primary%3ADownload%2FGXL%2FWall-Art-2x3.zip"), "Wall-Art-2x3.zip");
  const names = ["listing-10.jpg", "listing-2.jpg", "listing-01.jpg"].map(name => ({ name })).sort(byNaturalName).map(row => row.name);
  assert.deepEqual(names, ["listing-01.jpg", "listing-2.jpg", "listing-10.jpg"]);
  assert.equal(folderSupported(), false, "without the native file module the folder button stays hidden");
});
