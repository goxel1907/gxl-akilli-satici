import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../mobile/${path}`, import.meta.url), "utf8"));

// APK kurmadan giden güncelleme (EAS Update) yalnız aynı "version" ile derlenmiş APK'ye gider.
// Paket listesi değişip sürüm aynı kalırsa yeni JavaScript eski APK'de olmayan bir modülü arar ve uygulama açılmaz.
test("a new or changed app package always comes with a new app version and APK", () => {
  const app = read("app.json").expo;
  const pkg = read("package.json");
  const snapshot = read("native-modules.json");
  assert.equal(app.runtimeVersion?.policy, "appVersion", "updates must target the APK built with the same app version");
  assert.equal(app.updates?.url, `https://u.expo.dev/${app.extra.eas.projectId}`);
  assert.equal(snapshot.appVersion, app.version, "app.json version changed: update apps/mobile/native-modules.json to the new version and its packages");
  assert.deepEqual(pkg.dependencies, snapshot.dependencies, "app packages changed: raise app.json version (a new APK is needed), then update apps/mobile/native-modules.json");
});

test("every APK build profile listens to an update channel", () => {
  const eas = read("eas.json");
  assert.equal(eas.build.preview.channel, "preview");
  assert.equal(eas.build.production.channel, "production");
});
